import { List_last, List_takeLast } from '../native-js.js';
import { List_setLast } from '../native.js';
import { Node, NodeKind, NodeKind_isLoop } from './node.js';

export class ControlFlowAnalyzer {
	_isLoopBreakTarget: Array<boolean>;
	_isControlFlowLive: Array<boolean>;

	pushBlock(node: Node): void {
		let parent = node.parent();

		// Push control flow
		this._isControlFlowLive.push(this._isControlFlowLive.length === 0 || List_last(this._isControlFlowLive));

		// Push loop info
		if (parent !== null && NodeKind_isLoop(parent.kind)) {
			this._isLoopBreakTarget.push(false);
		}
	}

	popBlock(node: Node): void {
		let parent = node.parent();

		// Pop control flow
		let isLive = List_takeLast(this._isControlFlowLive);

		if (isLive) {
			node.hasControlFlowAtEnd = true;
		}

		// Pop loop info
		if (
			parent !== null &&
			NodeKind_isLoop(parent.kind) &&
			!List_takeLast(this._isLoopBreakTarget) &&
			((parent.kind === NodeKind.WHILE && parent.whileTest().isTrue()) ||
				(parent.kind === NodeKind.DO_WHILE && parent.doWhileTest().isTrue()) ||
				(parent.kind === NodeKind.FOR && (parent.forTest() === null || parent.forTest().isTrue())))
		) {
			List_setLast(this._isControlFlowLive, false);
		}
	}

	visitStatement(node: Node): void {
		if (!List_last(this._isControlFlowLive)) {
			return;
		}

		switch (node.kind) {
			case NodeKind.BREAK: {
				if (!(this._isLoopBreakTarget.length === 0)) {
					List_setLast(this._isLoopBreakTarget, true);
				}

				List_setLast(this._isControlFlowLive, false);
				break;
			}

			case NodeKind.RETURN:
			case NodeKind.DISCARD:
			case NodeKind.CONTINUE: {
				List_setLast(this._isControlFlowLive, false);
				break;
			}

			case NodeKind.IF: {
				let test = node.ifTest();
				let trueValue = node.ifTrue();
				let falseValue = node.ifFalse();

				if (test.isTrue()) {
					if (!trueValue.hasControlFlowAtEnd) {
						List_setLast(this._isControlFlowLive, false);
					}
				} else if (test.isFalse() && falseValue !== null) {
					if (!falseValue.hasControlFlowAtEnd) {
						List_setLast(this._isControlFlowLive, false);
					}
				} else if (trueValue !== null && falseValue !== null) {
					if (!trueValue.hasControlFlowAtEnd && !falseValue.hasControlFlowAtEnd) {
						List_setLast(this._isControlFlowLive, false);
					}
				}
				break;
			}
		}
	}

	constructor() {
		this._isLoopBreakTarget = [];
		this._isControlFlowLive = [];
	}
}
