import { Node, NodeKind, NodeKind_isLoop } from './node.js';

export class ControlFlowAnalyzer {
	_isLoopBreakTarget: boolean[];
	_isControlFlowLive: boolean[];

	pushBlock(node: Node): void {
		const parent = node.parent();

		// Push control flow
		this._isControlFlowLive.push(this._isControlFlowLive.length === 0 || this._isControlFlowLive.pop());

		// Push loop info
		if (parent !== null && NodeKind_isLoop(parent.kind)) {
			this._isLoopBreakTarget.push(false);
		}
	}

	popBlock(node: Node): void {
		const parent = node.parent();

		// Pop control flow
		const isLive = this._isControlFlowLive.pop();

		if (isLive) {
			node.hasControlFlowAtEnd = true;
		}

		// Pop loop info
		if (
			parent !== null &&
			NodeKind_isLoop(parent.kind) &&
			!this._isLoopBreakTarget.pop() &&
			((parent.kind === NodeKind.WHILE && parent.whileTest().isTrue()) ||
				(parent.kind === NodeKind.DO_WHILE && parent.doWhileTest().isTrue()) ||
				(parent.kind === NodeKind.FOR && (parent.forTest() === null || parent.forTest().isTrue())))
		) {
			this._isControlFlowLive[this._isControlFlowLive.length - 1] = false;
		}
	}

	visitStatement(node: Node): void {
		if (!this._isControlFlowLive.at(-1)) {
			return;
		}

		switch (node.kind) {
			case NodeKind.BREAK: {
				if (!(this._isLoopBreakTarget.length === 0)) {
					this._isLoopBreakTarget[this._isLoopBreakTarget.length - 1] = true;
				}

				this._isControlFlowLive[this._isControlFlowLive.length - 1] = false;
				break;
			}

			case NodeKind.RETURN:
			case NodeKind.DISCARD:
			case NodeKind.CONTINUE: {
				this._isControlFlowLive[this._isControlFlowLive.length - 1] = false;
				break;
			}

			case NodeKind.IF: {
				const test = node.ifTest();
				const trueValue = node.ifTrue();
				const falseValue = node.ifFalse();

				if (test.isTrue()) {
					if (!trueValue.hasControlFlowAtEnd) {
						this._isControlFlowLive[this._isControlFlowLive.length - 1] = false;
					}
				} else if (test.isFalse() && falseValue !== null) {
					if (!falseValue.hasControlFlowAtEnd) {
						this._isControlFlowLive[this._isControlFlowLive.length - 1] = false;
					}
				} else if (trueValue !== null && falseValue !== null) {
					if (!trueValue.hasControlFlowAtEnd && !falseValue.hasControlFlowAtEnd) {
						this._isControlFlowLive[this._isControlFlowLive.length - 1] = false;
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
