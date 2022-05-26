import { FlatHeaderCell, GroupHeaderCell } from '$lib/headerCells';
import type { NewTableAttributeSet, NewTablePropSet, TablePlugin } from '$lib/types/TablePlugin';
import { sum } from '$lib/utils/math';
import { keyed } from 'svelte-keyed';
import { derived, writable, type Writable } from 'svelte/store';

export type ResizedColumnsState = {
	columnWidths: Writable<Record<string, number>>;
};

export type ResizedColumnsPropSet = NewTablePropSet<{
	'thead.tr.th': {
		(node: Element): void;
		drag: (event: Event) => void;
	};
}>;

export type ResizedColumnsAttributeSet = NewTableAttributeSet<{
	'thead.tr.th': {
		style?: {
			width: string;
			'min-width': string;
			'max-width': string;
			'box-sizing': 'border-box';
		};
	};
}>;

const getDragXPos = (event: Event): number => {
	if (event instanceof MouseEvent) return event.clientX;
	if (event instanceof TouchEvent) return event.targetTouches[0].pageX;
	return 0;
};

type ColumnsWidthState = {
	current: Record<string, number>;
	start: Record<string, number>;
};

export const addResizedColumns =
	<Item>(): TablePlugin<
		Item,
		ResizedColumnsState,
		Record<string, never>,
		ResizedColumnsPropSet,
		ResizedColumnsAttributeSet
	> =>
	() => {
		const columnsWidthState = writable<ColumnsWidthState>({
			current: {},
			start: {},
		});
		const columnWidths = keyed(columnsWidthState, 'current');

		const pluginState = { columnWidths };

		const dragStartXPosForId: Record<string, number> = {};
		const nodeForId: Record<string, Element> = {};

		return {
			pluginState,
			hooks: {
				'thead.tr.th': (cell) => {
					const dragStart = (event: Event) => {
						event.stopPropagation();
						event.preventDefault();
						const { target } = event;
						if (target === null) return;
						dragStartXPosForId[cell.id] = getDragXPos(event);
						columnsWidthState.update(($columnsWidthState) => {
							const $updatedState = {
								...$columnsWidthState,
								start: { ...$columnsWidthState.start },
							};
							if (cell instanceof GroupHeaderCell) {
								cell.ids.forEach((id) => {
									$updatedState.start[id] = $columnsWidthState.current[id];
								});
							} else {
								$updatedState.start[cell.id] = $columnsWidthState.current[cell.id];
							}
							return $updatedState;
						});
						if (event instanceof MouseEvent) {
							window.addEventListener('mousemove', dragMove);
							window.addEventListener('mouseup', dragEnd);
						} else {
							window.addEventListener('touchmove', dragMove);
							window.addEventListener('touchend', dragEnd);
						}
					};
					const dragMove = (event: Event) => {
						event.stopPropagation();
						event.preventDefault();
						const deltaWidth = getDragXPos(event) - dragStartXPosForId[cell.id];
						columnsWidthState.update(($columnsWidthState) => {
							const $updatedState = {
								...$columnsWidthState,
								current: { ...$columnsWidthState.current },
							};
							if (cell instanceof GroupHeaderCell) {
								const totalStartWidth = sum(cell.ids.map((id) => $columnsWidthState.start[id]));
								cell.ids.forEach((id) => {
									const startWidth = $columnsWidthState.start[id];
									if (startWidth !== undefined) {
										$updatedState.current[id] = Math.max(
											0,
											startWidth + deltaWidth * (startWidth / totalStartWidth)
										);
									}
								});
							} else {
								const startWidth = $columnsWidthState.start[cell.id];
								if (startWidth !== undefined) {
									$updatedState.current[cell.id] = Math.max(0, startWidth + deltaWidth);
								}
							}
							return $updatedState;
						});
					};
					const dragEnd = (event: Event) => {
						event.stopPropagation();
						event.preventDefault();
						if (cell instanceof GroupHeaderCell) {
							cell.ids.forEach((id) => {
								const node = nodeForId[id];
								if (node !== undefined) {
									columnWidths.update(($columnWidths) => ({
										...$columnWidths,
										[id]: node.clientWidth,
									}));
								}
							});
						} else {
							const node = nodeForId[cell.id];
							if (node !== undefined) {
								columnWidths.update(($columnWidths) => ({
									...$columnWidths,
									[cell.id]: node.clientWidth,
								}));
							}
						}
						if (event instanceof MouseEvent) {
							window.removeEventListener('mousemove', dragMove);
							window.removeEventListener('mouseup', dragEnd);
						} else {
							window.removeEventListener('touchmove', dragMove);
							window.removeEventListener('touchend', dragEnd);
						}
					};
					const action = (node: Element) => {
						nodeForId[cell.id] = node;
						if (cell instanceof FlatHeaderCell) {
							columnWidths.update(($columnWidths) => ({
								...$columnWidths,
								[cell.id]: node.clientWidth,
							}));
						}
						return {
							destroy() {
								delete nodeForId[cell.id];
							},
						};
					};
					action.drag = dragStart;
					const props = derived([], () => {
						return action;
					});
					const attrs = derived(columnWidths, ($columnWidths) => {
						const width = $columnWidths[cell.id];
						if (width === undefined) {
							return {};
						}
						const widthPx = `${width}px`;
						return {
							style: {
								width: widthPx,
								'min-width': widthPx,
								'max-width': widthPx,
								'box-sizing': 'border-box' as const,
							},
						};
					});
					return { props, attrs };
				},
			},
		};
	};
