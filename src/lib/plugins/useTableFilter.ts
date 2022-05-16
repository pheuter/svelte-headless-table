import { DataBodyCell } from '$lib/bodyCells';
import type { BodyRow } from '$lib/bodyRows';
import type { TablePlugin, NewTablePropSet, DeriveRowsFn } from '$lib/types/TablePlugin';
import { getCloned } from '$lib/utils/clone';
import { derived, writable, type Readable, type Writable } from 'svelte/store';

export interface TableFilterConfig {
	fn?: TableFilterFn;
	initialFilterValue?: string;
	includeHiddenColumns?: boolean;
}

export interface TableFilterState<Item> {
	filterValue: Writable<string>;
	preFilteredRows: Readable<BodyRow<Item>[]>;
}

// Item generic needed to infer type on `getFilteredRows`
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface TableFilterColumnOptions<Item> {
	exclude?: boolean;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	getFilterValue?: (value: any) => string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TableFilterFn = (props: TableFilterFnProps) => boolean;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TableFilterFnProps = {
	filterValue: string;
	value: string;
};

export type TableFilterPropSet = NewTablePropSet<{
	'tbody.tr.td': {
		matches: boolean;
	};
}>;

interface GetFilteredRowsProps {
	tableCellMatches: Writable<Record<string, boolean>>;
	fn: TableFilterFn;
	includeHiddenColumns: boolean;
}

const getFilteredRows = <Item, Row extends BodyRow<Item>>(
	rows: Row[],
	filterValue: string,
	columnOptions: Record<string, TableFilterColumnOptions<Item>>,
	{ tableCellMatches, fn, includeHiddenColumns }: GetFilteredRowsProps
): Row[] => {
	const _filteredRows = rows
		// Filter `subRows`
		.map((row) => {
			const { subRows } = row;
			if (subRows === undefined) {
				return row;
			}
			const filteredSubRows = getFilteredRows(subRows, filterValue, columnOptions, {
				tableCellMatches,
				fn,
				includeHiddenColumns,
			});
			return getCloned(row, {
				subRows: filteredSubRows,
			} as unknown as Row);
		})
		.filter((row) => {
			if ((row.subRows?.length ?? 0) !== 0) {
				return true;
			}
			// An array of booleans, true if the cell matches the filter.
			const rowCellMatches = Object.values(row.cellForId).map((cell) => {
				const options = columnOptions[cell.id] as TableFilterColumnOptions<Item> | undefined;
				if (options?.exclude === true) {
					return false;
				}
				const isHidden = row.cells.find((c) => c.id === cell.id) === undefined;
				if (isHidden && !includeHiddenColumns) {
					return false;
				}
				if (!(cell instanceof DataBodyCell)) {
					return false;
				}
				let value = cell.value;
				if (options?.getFilterValue !== undefined) {
					value = options?.getFilterValue(value);
				}
				const matches = fn({ value: String(value), filterValue });
				tableCellMatches.update(($tableCellMatches) => ({
					...$tableCellMatches,
					[cell.rowColId()]: matches,
				}));
				return matches;
			});
			// If any cell matches, include in the filtered results.
			return rowCellMatches.includes(true);
		});
	return _filteredRows;
};

export const useTableFilter =
	<Item>({
		fn = textPrefixFilter,
		initialFilterValue = '',
		includeHiddenColumns = false,
	}: TableFilterConfig = {}): TablePlugin<
		Item,
		TableFilterState<Item>,
		TableFilterColumnOptions<Item>,
		TableFilterPropSet
	> =>
	({ columnOptions }) => {
		const filterValue = writable(initialFilterValue);
		const preFilteredRows = writable<BodyRow<Item>[]>([]);
		const filteredRows = writable<BodyRow<Item>[]>([]);
		const tableCellMatches = writable<Record<string, boolean>>({});

		const pluginState: TableFilterState<Item> = { filterValue, preFilteredRows };

		const deriveRows: DeriveRowsFn<Item> = (rows) => {
			return derived([rows, filterValue], ([$rows, $filterValue]) => {
				preFilteredRows.set($rows);
				tableCellMatches.set({});
				const _filteredRows = getFilteredRows($rows, $filterValue, columnOptions, {
					tableCellMatches,
					fn,
					includeHiddenColumns,
				});
				filteredRows.set(_filteredRows);
				return _filteredRows;
			});
		};

		return {
			pluginState,
			deriveRows,
			hooks: {
				'tbody.tr.td': (cell) => {
					const props = derived(
						[filterValue, tableCellMatches],
						([$filterValue, $tableCellMatches]) => {
							return {
								matches: $filterValue !== '' && ($tableCellMatches[cell.rowColId()] ?? false),
							};
						}
					);
					return { props };
				},
			},
		};
	};

export const textPrefixFilter: TableFilterFn = ({ filterValue, value }) => {
	if (filterValue === '') {
		return true;
	}
	return String(value).toLowerCase().startsWith(String(filterValue).toLowerCase());
};
