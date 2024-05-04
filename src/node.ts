import { ExtensionBehavior } from './compiler.js';
import { Range } from './range.js';
import { FunctionSymbol, StructSymbol, SymbolFlags, VariableSymbol, BaseSymbol } from './symbol.js';
import { Type } from './type.js';

export enum NodeKind {
	// Other
	GLOBAL,
	STRUCT_BLOCK,
	VARIABLE,

	// Statements
	BLOCK,
	BREAK,
	CONTINUE,
	DISCARD,
	DO_WHILE,
	EXPRESSION,
	EXTENSION,
	FOR,
	FUNCTION,
	IF,
	MODIFIER_BLOCK,
	PRECISION,
	RETURN,
	STRUCT,
	VARIABLES,
	VERSION,
	WHILE,

	// Expressions
	CALL,
	DOT,
	HOOK,
	NAME,
	PARSE_ERROR,
	SEQUENCE,
	TYPE,
	UNKNOWN_CONSTANT,

	// Literals
	BOOL,
	FLOAT,
	INT,

	// Unary prefix
	NEGATIVE,
	NOT,
	POSITIVE,

	// Unary prefix assign
	PREFIX_DECREMENT,
	PREFIX_INCREMENT,

	// Unary postfix assign
	POSTFIX_DECREMENT,
	POSTFIX_INCREMENT,

	// Binary
	ADD,
	DIVIDE,
	EQUAL,
	GREATER_THAN,
	GREATER_THAN_OR_EQUAL,
	INDEX,
	LESS_THAN,
	LESS_THAN_OR_EQUAL,
	LOGICAL_AND,
	LOGICAL_OR,
	LOGICAL_XOR,
	MULTIPLY,
	NOT_EQUAL,
	SUBTRACT,

	// Binary assignment
	ASSIGN,
	ASSIGN_ADD,
	ASSIGN_DIVIDE,
	ASSIGN_MULTIPLY,
	ASSIGN_SUBTRACT,
}

export class Node {
	id: number;
	kind: NodeKind;
	range: Range;
	internalRange: Range;
	symbol: BaseSymbol;
	resolvedType: Type;
	_literal: number;
	_text: string;
	_parent: Node;
	_firstChild: Node;
	_lastChild: Node;
	_previousSibling: Node;
	_nextSibling: Node;
	hasControlFlowAtEnd: boolean;
	static _nextID = 0;

	_copyMembersFrom(node: Node): void {
		this.kind = node.kind;
		this.range = node.range;
		this.internalRange = node.internalRange;
		this.symbol = node.symbol;
		this.resolvedType = node.resolvedType;
		this._literal = node._literal;
		this._text = node._text;
	}

	cloneWithoutChildren(): Node {
		const clone = new Node(this.kind);
		clone._copyMembersFrom(this);
		return clone;
	}

	// When used with become(), this provides a convenient way to wrap a node in
	// an operation without the caller needing to be aware of replaceWith():
	//
	//  node.become(Node.createUnary(.NOT, node.cloneAndStealChildren))
	//
	cloneAndStealChildren(): Node {
		const clone = this.cloneWithoutChildren();

		while (this.hasChildren()) {
			clone.appendChild(this._firstChild.remove());
		}

		return clone;
	}

	clone(): Node {
		const clone = this.cloneWithoutChildren();

		for (let child = this._firstChild; child !== null; child = child._nextSibling) {
			clone.appendChild(child.clone());
		}

		return clone;
	}

	// Change self node in place to become the provided node. The parent node is
	// not changed, so become() can be called within a nested method and does not
	// need to report the updated node reference to the caller since the reference
	// does not change.
	become(node: Node): void {
		if (node === this) {
			return;
		}

		console.assert(node._parent === null);
		this._copyMembersFrom(node);
		this.removeChildren();
		this.appendChildrenFrom(node);
	}

	parent(): Node {
		return this._parent;
	}

	firstChild(): Node {
		return this._firstChild;
	}

	lastChild(): Node {
		return this._lastChild;
	}

	previousSibling(): Node {
		return this._previousSibling;
	}

	nextSibling(): Node {
		return this._nextSibling;
	}

	// This is cheaper than childCount == 0
	hasChildren(): boolean {
		return this._firstChild !== null;
	}

	// This is cheaper than childCount == 1
	hasOneChild(): boolean {
		return this.hasChildren() && this._firstChild === this._lastChild;
	}

	childCount(): number {
		let count = 0;

		for (let child = this._firstChild; child !== null; child = child._nextSibling) {
			count = count + 1;
		}

		return count;
	}

	childAt(index: number): Node {
		console.assert(0 <= index && index < this.childCount());
		let child = this._firstChild;

		while (index !== 0) {
			child = child._nextSibling;
			index = index - 1;
		}

		return child;
	}

	withType(value: Type): Node {
		this.resolvedType = value;
		return this;
	}

	withSymbol(value: BaseSymbol): Node {
		this.symbol = value;
		return this;
	}

	withBool(value: boolean): Node {
		this._literal = value ? 1 : 0;
		return this;
	}

	withInt(value: number): Node {
		this._literal = value;
		return this;
	}

	withFloat(value: number): Node {
		this._literal = value;
		return this;
	}

	withText(value: string): Node {
		this._text = value;
		return this;
	}

	withRange(value: Range): Node {
		this.range = value;
		return this;
	}

	withInternalRange(value: Range): Node {
		this.internalRange = value;
		return this;
	}

	appendChild(node: Node): Node {
		if (node === null) {
			return this;
		}

		console.assert(node !== this);
		console.assert(node._parent === null);
		console.assert(node._previousSibling === null);
		console.assert(node._nextSibling === null);
		node._parent = this;

		if (this.hasChildren()) {
			node._previousSibling = this._lastChild;
			this._lastChild._nextSibling = node;
			this._lastChild = node;
		} else {
			this._lastChild = this._firstChild = node;
		}

		return this;
	}

	appendChildrenFrom(node: Node): Node {
		console.assert(node !== this);

		while (node.hasChildren()) {
			this.appendChild(node._firstChild.remove());
		}

		return this;
	}

	remove(): Node {
		console.assert(this._parent !== null);

		if (this._previousSibling !== null) {
			console.assert(this._previousSibling._nextSibling === this);
			this._previousSibling._nextSibling = this._nextSibling;
		} else {
			console.assert(this._parent._firstChild === this);
			this._parent._firstChild = this._nextSibling;
		}

		if (this._nextSibling !== null) {
			console.assert(this._nextSibling._previousSibling === this);
			this._nextSibling._previousSibling = this._previousSibling;
		} else {
			console.assert(this._parent._lastChild === this);
			this._parent._lastChild = this._previousSibling;
		}

		this._parent = null;
		this._previousSibling = null;
		this._nextSibling = null;
		return this;
	}

	removeChildren(): void {
		while (this.hasChildren()) {
			this._firstChild.remove();
		}
	}

	replaceWith(node: Node): Node {
		console.assert(node !== this);
		console.assert(this._parent !== null);
		console.assert(node._parent === null);
		console.assert(node._previousSibling === null);
		console.assert(node._nextSibling === null);
		node._parent = this._parent;
		node._previousSibling = this._previousSibling;
		node._nextSibling = this._nextSibling;

		if (this._previousSibling !== null) {
			console.assert(this._previousSibling._nextSibling === this);
			this._previousSibling._nextSibling = node;
		} else {
			console.assert(this._parent._firstChild === this);
			this._parent._firstChild = node;
		}

		if (this._nextSibling !== null) {
			console.assert(this._nextSibling._previousSibling === this);
			this._nextSibling._previousSibling = node;
		} else {
			console.assert(this._parent._lastChild === this);
			this._parent._lastChild = node;
		}

		this._parent = null;
		this._previousSibling = null;
		this._nextSibling = null;
		return this;
	}

	insertChildBefore(after: Node, before: Node): Node {
		if (before === null) {
			return this;
		}

		console.assert(before !== after);
		console.assert(before._parent === null);
		console.assert(before._previousSibling === null);
		console.assert(before._nextSibling === null);
		console.assert(after === null || after._parent === this);

		if (after === null) {
			return this.appendChild(before);
		}

		before._parent = this;
		before._previousSibling = after._previousSibling;
		before._nextSibling = after;

		if (after._previousSibling !== null) {
			console.assert(after === after._previousSibling._nextSibling);
			after._previousSibling._nextSibling = before;
		} else {
			console.assert(after === this._firstChild);
			this._firstChild = before;
		}

		after._previousSibling = before;
		return this;
	}

	replaceWithChildren(): void {
		while (this.hasChildren()) {
			this.parent().insertChildBefore(this.nextSibling(), this.lastChild().remove());
		}

		this.remove();
	}

	isTrue(): boolean {
		return this.kind === NodeKind.BOOL && this.asBool();
	}

	isFalse(): boolean {
		return this.kind === NodeKind.BOOL && !this.asBool();
	}

	isIntOrFloat(value: number): boolean {
		return (this.kind === NodeKind.INT && this.asInt() === value) || (this.kind === NodeKind.FLOAT && this.asFloat() === value);
	}

	isCallTarget(): boolean {
		return this.parent() !== null && this.parent().kind === NodeKind.CALL && this.parent().callTarget() === this;
	}

	isAssignTarget(): boolean {
		if (this.parent() !== null) {
			// Check whether this node is the target of a mutating operator
			if (NodeKind_isUnaryAssign(this.parent().kind) || (NodeKind_isBinaryAssign(this.parent().kind) && this.parent().binaryLeft() === this)) {
				return true;
			}

			// Check whether this node is an "inout" argument in a function call.
			// But only do this if the function call was resolved correctly.
			if (this.parent().kind === NodeKind.CALL && this.parent().resolvedType !== Type.ERROR) {
				const callTarget = this.parent().callTarget();
				const symbol = callTarget.symbol;

				if (symbol !== null && symbol.isFunction()) {
					const _function = symbol.asFunction();
					let i = 0;

					for (let child = callTarget.nextSibling(); child !== null; child = child.nextSibling()) {
						if (child === this) {
							return (SymbolFlags.INOUT & _function._arguments[i].flags) !== 0;
						}

						i++;
					}
				}
			}
		}

		return false;
	}

	isUsedInStorage(): boolean {
		if (this.isAssignTarget()) {
			return true;
		}

		if (this.parent() !== null && (this.parent().kind === NodeKind.DOT || this.parent().kind === NodeKind.INDEX)) {
			return this.parent().isUsedInStorage();
		}

		return false;
	}

	isEmptyBlock(): boolean {
		return this.kind === NodeKind.BLOCK && !this.hasChildren();
	}

	isEmptySequence(): boolean {
		return this.kind === NodeKind.SEQUENCE && !this.hasChildren();
	}

	isNumberLessThanZero(): boolean {
		return (this.kind === NodeKind.INT && this.asInt() < 0) || (this.kind === NodeKind.FLOAT && this.asFloat() < 0);
	}

	hasNoSideEffects(): boolean {
		console.assert(NodeKind_isExpression(this.kind));

		switch (this.kind) {
			case NodeKind.BOOL:
			case NodeKind.FLOAT:
			case NodeKind.INT:
			case NodeKind.NAME: {
				return true;
			}

			case NodeKind.HOOK: {
				return this.hookTest().hasNoSideEffects() && this.hookTrue().hasNoSideEffects() && this.hookFalse().hasNoSideEffects();
			}

			case NodeKind.DOT: {
				return this.dotTarget().hasNoSideEffects();
			}

			default: {
				if (NodeKind_isUnary(this.kind)) {
					return !NodeKind_isUnaryAssign(this.kind) && this.unaryValue().hasNoSideEffects();
				}

				if (NodeKind_isBinary(this.kind)) {
					return !NodeKind_isBinaryAssign(this.kind) && this.binaryLeft().hasNoSideEffects() && this.binaryRight().hasNoSideEffects();
				}

				return false;
			}
		}
	}

	invertBooleanCondition(): void {
		console.assert(NodeKind_isExpression(this.kind));

		switch (this.kind) {
			case NodeKind.BOOL: {
				this.withBool(!this.asBool());
				break;
			}

			case NodeKind.NOT: {
				this.become(this.unaryValue().remove());
				break;
			}

			case NodeKind.EQUAL: {
				this.kind = NodeKind.NOT_EQUAL;
				break;
			}

			case NodeKind.NOT_EQUAL: {
				this.kind = NodeKind.EQUAL;
				break;
			}

			case NodeKind.LESS_THAN: {
				this.kind = NodeKind.GREATER_THAN_OR_EQUAL;
				break;
			}

			case NodeKind.GREATER_THAN: {
				this.kind = NodeKind.LESS_THAN_OR_EQUAL;
				break;
			}

			case NodeKind.LESS_THAN_OR_EQUAL: {
				this.kind = NodeKind.GREATER_THAN;
				break;
			}

			case NodeKind.GREATER_THAN_OR_EQUAL: {
				this.kind = NodeKind.LESS_THAN;
				break;
			}

			case NodeKind.SEQUENCE: {
				this.lastChild().invertBooleanCondition();
				break;
			}

			case NodeKind.LOGICAL_OR: {
				this.kind = NodeKind.LOGICAL_AND;
				this.binaryLeft().invertBooleanCondition();
				this.binaryRight().invertBooleanCondition();
				break;
			}

			case NodeKind.LOGICAL_AND: {
				this.kind = NodeKind.LOGICAL_OR;
				this.binaryLeft().invertBooleanCondition();
				this.binaryRight().invertBooleanCondition();
				break;
			}

			default: {
				this.become(Node.createUnary(NodeKind.NOT, this.cloneAndStealChildren()).withType(Type.BOOL));
				break;
			}
		}
	}

	looksTheSameAs(node: Node): boolean {
		if (this.kind === node.kind) {
			switch (this.kind) {
				case NodeKind.BOOL: {
					return this.asBool() === node.asBool();
				}

				case NodeKind.FLOAT: {
					return this.asFloat() === node.asFloat();
				}

				case NodeKind.INT: {
					return this.asInt() === node.asInt();
				}

				case NodeKind.NAME: {
					return this.symbol === node.symbol;
				}

				case NodeKind.TYPE: {
					return this.resolvedType === node.resolvedType;
				}

				case NodeKind.DOT: {
					return this.dotTarget().looksTheSameAs(node.dotTarget()) && this.symbol === node.symbol && this.asString() === node.asString();
				}

				case NodeKind.HOOK: {
					return this.hookTest().looksTheSameAs(node.hookTest()) && this.hookTrue().looksTheSameAs(node.hookTrue()) && this.hookFalse().looksTheSameAs(node.hookFalse());
				}

				case NodeKind.CALL: {
					let left = this.firstChild();
					let right = node.firstChild();

					while (left !== null && right !== null) {
						if (!left.looksTheSameAs(right)) {
							return false;
						}

						left = left.nextSibling();
						right = right.nextSibling();
					}

					return left === null && right === null;
				}

				default: {
					if (NodeKind_isUnary(this.kind)) {
						return this.unaryValue().looksTheSameAs(node.unaryValue());
					}

					if (NodeKind_isBinary(this.kind)) {
						return this.binaryLeft().looksTheSameAs(node.binaryLeft()) && this.binaryRight().looksTheSameAs(node.binaryRight());
					}
					break;
				}
			}
		}

		return false;
	}

	static createGlobal(): Node {
		return new Node(NodeKind.GLOBAL);
	}

	static createStructBlock(): Node {
		return new Node(NodeKind.STRUCT_BLOCK);
	}

	static createVariable(symbol: VariableSymbol, value: Node): Node {
		return new Node(NodeKind.VARIABLE).withSymbol(symbol as BaseSymbol).appendChild(value);
	}

	static createBlock(): Node {
		return new Node(NodeKind.BLOCK);
	}

	static createBreak(): Node {
		return new Node(NodeKind.BREAK);
	}

	static createContinue(): Node {
		return new Node(NodeKind.CONTINUE);
	}

	static createDiscard(): Node {
		return new Node(NodeKind.DISCARD);
	}

	static createDoWhile(body: Node, test: Node): Node {
		console.assert(NodeKind_isStatement(body.kind));
		console.assert(NodeKind_isExpression(test.kind));
		return new Node(NodeKind.DO_WHILE).appendChild(body).appendChild(test);
	}

	static createExpression(value: Node): Node {
		console.assert(NodeKind_isExpression(value.kind));
		return new Node(NodeKind.EXPRESSION).appendChild(value);
	}

	static createExtension(name: string, behavior: ExtensionBehavior): Node {
		return new Node(NodeKind.EXTENSION).withText(name).withInt(behavior);
	}

	static createFor(setup: Node, test: Node, update: Node, body: Node): Node {
		console.assert(setup === null || NodeKind_isExpression(setup.kind) || setup.kind === NodeKind.VARIABLES);
		console.assert(test === null || NodeKind_isExpression(test.kind));
		console.assert(update === null || NodeKind_isExpression(update.kind));
		console.assert(NodeKind_isStatement(body.kind));
		return new Node(NodeKind.FOR)
			.appendChild(setup === null ? Node.createSequence() : setup)
			.appendChild(test === null ? Node.createSequence() : test)
			.appendChild(update === null ? Node.createSequence() : update)
			.appendChild(body);
	}

	static createFunction(symbol: FunctionSymbol): Node {
		return new Node(NodeKind.FUNCTION).withSymbol(symbol as BaseSymbol);
	}

	static createIf(test: Node, yes: Node, no: Node): Node {
		console.assert(NodeKind_isExpression(test.kind));
		console.assert(NodeKind_isStatement(yes.kind));
		console.assert(no === null || NodeKind_isStatement(no.kind));
		return new Node(NodeKind.IF).appendChild(test).appendChild(yes).appendChild(no);
	}

	static createModifierBlock(): Node {
		return new Node(NodeKind.MODIFIER_BLOCK);
	}

	static createPrecision(flags: number, type: Node): Node {
		console.assert(NodeKind_isExpression(type.kind));
		return new Node(NodeKind.PRECISION).withInt(flags).appendChild(type);
	}

	static createReturn(value: Node): Node {
		console.assert(value === null || NodeKind_isExpression(value.kind));
		return new Node(NodeKind.RETURN).appendChild(value);
	}

	static createStruct(symbol: StructSymbol, block: Node, variables: Node): Node {
		console.assert(block.kind === NodeKind.STRUCT_BLOCK);
		console.assert(variables === null || variables.kind === NodeKind.VARIABLES);
		return new Node(NodeKind.STRUCT)
			.withSymbol(symbol as BaseSymbol)
			.appendChild(block)
			.appendChild(variables);
	}

	static createVariables(flags: number, type: Node): Node {
		console.assert(NodeKind_isExpression(type.kind));
		return new Node(NodeKind.VARIABLES).withInt(flags).appendChild(type);
	}

	static createVersion(version: number): Node {
		return new Node(NodeKind.VERSION).withInt(version);
	}

	static createWhile(test: Node, body: Node): Node {
		console.assert(NodeKind_isExpression(test.kind));
		console.assert(NodeKind_isStatement(body.kind));
		return new Node(NodeKind.WHILE).appendChild(test).appendChild(body);
	}

	static createCall(value: Node): Node {
		console.assert(NodeKind_isExpression(value.kind));
		return new Node(NodeKind.CALL).appendChild(value);
	}

	static createConstructorCall(type: Type): Node {
		return Node.createCall(Node.createType(type)).withType(type);
	}

	static createDot(value: Node, text: string): Node {
		console.assert(NodeKind_isExpression(value.kind));
		console.assert(text !== null);
		return new Node(NodeKind.DOT).appendChild(value).withText(text);
	}

	static createHook(test: Node, yes: Node, no: Node): Node {
		console.assert(NodeKind_isExpression(test.kind));
		console.assert(NodeKind_isExpression(yes.kind));
		console.assert(NodeKind_isExpression(no.kind));
		return new Node(NodeKind.HOOK).appendChild(test).appendChild(yes).appendChild(no);
	}

	static createName(symbol: BaseSymbol): Node {
		return new Node(NodeKind.NAME).withSymbol(symbol);
	}

	static createParseError(): Node {
		return new Node(NodeKind.PARSE_ERROR).withType(Type.ERROR);
	}

	static createSequence(): Node {
		return new Node(NodeKind.SEQUENCE);
	}

	static createType(type: Type): Node {
		return new Node(NodeKind.TYPE).withType(type);
	}

	static createUnknownConstant(type: Type): Node {
		return new Node(NodeKind.UNKNOWN_CONSTANT).withType(type);
	}

	static createBool(value: boolean): Node {
		return new Node(NodeKind.BOOL).withBool(value).withType(Type.BOOL);
	}

	static createInt(value: number): Node {
		return new Node(NodeKind.INT).withInt(value).withType(Type.INT);
	}

	static createFloat(value: number): Node {
		return new Node(NodeKind.FLOAT).withFloat(value).withType(Type.FLOAT);
	}

	static createUnary(kind: NodeKind, value: Node): Node {
		console.assert(NodeKind_isUnary(kind));
		return new Node(kind).appendChild(value);
	}

	static createBinary(kind: NodeKind, left: Node, right: Node): Node {
		console.assert(NodeKind_isBinary(kind));
		return new Node(kind).appendChild(left).appendChild(right);
	}

	variableInitializer(): Node {
		console.assert(this.kind === NodeKind.VARIABLE);
		console.assert(this.childCount() <= 1);
		return this._firstChild;
	}

	doWhileBody(): Node {
		console.assert(this.kind === NodeKind.DO_WHILE);
		console.assert(this.childCount() === 2);
		console.assert(NodeKind_isStatement(this._firstChild.kind));
		return this._firstChild;
	}

	doWhileTest(): Node {
		console.assert(this.kind === NodeKind.DO_WHILE);
		console.assert(this.childCount() === 2);
		console.assert(NodeKind_isExpression(this._lastChild.kind));
		return this._lastChild;
	}

	expressionValue(): Node {
		console.assert(this.kind === NodeKind.EXPRESSION);
		console.assert(this.childCount() === 1);
		console.assert(NodeKind_isExpression(this._firstChild.kind));
		return this._firstChild;
	}

	extensionName(): string {
		console.assert(this.kind === NodeKind.EXTENSION);
		console.assert(this.childCount() === 0);
		console.assert(this._text !== null);
		return this._text;
	}

	extensionBehavior(): ExtensionBehavior {
		console.assert(this.kind === NodeKind.EXTENSION);
		console.assert(this.childCount() === 0);
		return this._literal | 0;
	}

	forSetup(): Node {
		console.assert(this.kind === NodeKind.FOR);
		console.assert(this.childCount() === 4);
		console.assert(NodeKind_isExpression(this._firstChild.kind) || this._firstChild.kind === NodeKind.VARIABLES);
		return this._firstChild.isEmptySequence() ? null : this._firstChild;
	}

	forTest(): Node {
		console.assert(this.kind === NodeKind.FOR);
		console.assert(this.childCount() === 4);
		console.assert(NodeKind_isExpression(this._firstChild._nextSibling.kind) || this._firstChild._nextSibling.kind === NodeKind.VARIABLES);
		return this._firstChild._nextSibling.isEmptySequence() ? null : this._firstChild._nextSibling;
	}

	forUpdate(): Node {
		console.assert(this.kind === NodeKind.FOR);
		console.assert(this.childCount() === 4);
		console.assert(NodeKind_isExpression(this._lastChild._previousSibling.kind));
		return this._lastChild._previousSibling.isEmptySequence() ? null : this._lastChild._previousSibling;
	}

	forBody(): Node {
		console.assert(this.kind === NodeKind.FOR);
		console.assert(this.childCount() === 4);
		console.assert(NodeKind_isStatement(this._lastChild.kind));
		return this._lastChild;
	}

	ifTest(): Node {
		console.assert(this.kind === NodeKind.IF);
		console.assert(this.childCount() === 2 || this.childCount() === 3);
		console.assert(NodeKind_isExpression(this._firstChild.kind));
		return this._firstChild;
	}

	ifTrue(): Node {
		console.assert(this.kind === NodeKind.IF);
		console.assert(this.childCount() === 2 || this.childCount() === 3);
		console.assert(NodeKind_isStatement(this._firstChild._nextSibling.kind));
		return this._firstChild._nextSibling;
	}

	ifFalse(): Node {
		console.assert(this.kind === NodeKind.IF);
		console.assert(this.childCount() === 2 || this.childCount() === 3);
		console.assert(this._firstChild._nextSibling._nextSibling === null || NodeKind_isStatement(this._firstChild._nextSibling._nextSibling.kind));
		return this._firstChild._nextSibling._nextSibling;
	}

	precisionFlag(): SymbolFlags {
		console.assert(this.kind === NodeKind.PRECISION);
		console.assert(this.childCount() === 1);
		return this._literal | 0;
	}

	precisionType(): Node {
		console.assert(this.kind === NodeKind.PRECISION);
		console.assert(this.childCount() === 1);
		console.assert(NodeKind_isExpression(this._firstChild.kind));
		return this._firstChild;
	}

	returnValue(): Node {
		console.assert(this.kind === NodeKind.RETURN);
		console.assert(this.childCount() <= 1);
		console.assert(this._firstChild === null || NodeKind_isExpression(this._firstChild.kind));
		return this._firstChild;
	}

	variablesFlags(): SymbolFlags {
		console.assert(this.kind === NodeKind.VARIABLES);
		console.assert(this.childCount() >= 1);
		return this._literal | 0;
	}

	variablesType(): Node {
		console.assert(this.kind === NodeKind.VARIABLES);
		console.assert(this.childCount() >= 1);
		console.assert(NodeKind_isExpression(this._firstChild.kind));
		return this._firstChild;
	}

	structBlock(): Node {
		console.assert(this.kind === NodeKind.STRUCT);
		console.assert(this.childCount() === 1 || this.childCount() === 2);
		console.assert(this._firstChild.kind === NodeKind.STRUCT_BLOCK);
		return this._firstChild;
	}

	structVariables(): Node {
		console.assert(this.kind === NodeKind.STRUCT);
		console.assert(this.childCount() === 1 || this.childCount() === 2);
		console.assert(this._firstChild._nextSibling === null || this._firstChild._nextSibling.kind === NodeKind.VARIABLES);
		return this._firstChild._nextSibling;
	}

	versionNumber(): number {
		console.assert(this.kind === NodeKind.VERSION);
		console.assert(this.childCount() === 0);
		return this._literal | 0;
	}

	whileTest(): Node {
		console.assert(this.kind === NodeKind.WHILE);
		console.assert(this.childCount() === 2);
		console.assert(NodeKind_isExpression(this._firstChild.kind));
		return this._firstChild;
	}

	whileBody(): Node {
		console.assert(this.kind === NodeKind.WHILE);
		console.assert(this.childCount() === 2);
		console.assert(NodeKind_isStatement(this._lastChild.kind));
		return this._lastChild;
	}

	callTarget(): Node {
		console.assert(this.kind === NodeKind.CALL);
		console.assert(this.childCount() >= 1);
		console.assert(NodeKind_isExpression(this._firstChild.kind));
		return this._firstChild;
	}

	dotTarget(): Node {
		console.assert(this.kind === NodeKind.DOT);
		console.assert(this.childCount() === 1);
		console.assert(NodeKind_isExpression(this._firstChild.kind));
		return this._firstChild;
	}

	hookTest(): Node {
		console.assert(this.kind === NodeKind.HOOK);
		console.assert(this.childCount() === 3);
		console.assert(NodeKind_isExpression(this._firstChild.kind));
		return this._firstChild;
	}

	hookTrue(): Node {
		console.assert(this.kind === NodeKind.HOOK);
		console.assert(this.childCount() === 3);
		console.assert(NodeKind_isExpression(this._firstChild._nextSibling.kind));
		return this._firstChild._nextSibling;
	}

	hookFalse(): Node {
		console.assert(this.kind === NodeKind.HOOK);
		console.assert(this.childCount() === 3);
		console.assert(NodeKind_isExpression(this._lastChild.kind));
		return this._lastChild;
	}

	asString(): string {
		console.assert(this.kind === NodeKind.DOT);
		console.assert(this._text !== null);
		return this._text;
	}

	asBool(): boolean {
		console.assert(this.kind === NodeKind.BOOL);
		return !!this._literal;
	}

	asFloat(): number {
		console.assert(this.kind === NodeKind.FLOAT);
		return this._literal;
	}

	asInt(): number {
		console.assert(this.kind === NodeKind.INT);
		return this._literal | 0;
	}

	unaryValue(): Node {
		console.assert(NodeKind_isUnary(this.kind));
		console.assert(this.childCount() === 1);
		console.assert(NodeKind_isExpression(this._firstChild.kind));
		return this._firstChild;
	}

	binaryLeft(): Node {
		console.assert(NodeKind_isBinary(this.kind));
		console.assert(this.childCount() === 2);
		console.assert(NodeKind_isExpression(this._firstChild.kind));
		return this._firstChild;
	}

	binaryRight(): Node {
		console.assert(NodeKind_isBinary(this.kind));
		console.assert(this.childCount() === 2);
		console.assert(NodeKind_isExpression(this._lastChild.kind));
		return this._lastChild;
	}

	static _createID(): number {
		Node._nextID = Node._nextID + 1;
		return Node._nextID;
	}

	constructor(kind: NodeKind) {
		this.id = Node._createID();
		this.kind = kind;
		this.range = null;
		this.internalRange = null;
		this.symbol = null;
		this.resolvedType = null;
		this._literal = 0;
		this._text = null;
		this._parent = null;
		this._firstChild = null;
		this._lastChild = null;
		this._previousSibling = null;
		this._nextSibling = null;
		this.hasControlFlowAtEnd = false;
	}
}

export function NodeKind_isStatement(self: NodeKind): boolean {
	return self >= NodeKind.BLOCK && self <= NodeKind.WHILE;
}

export function NodeKind_isExpression(self: NodeKind): boolean {
	return self >= NodeKind.CALL && self <= NodeKind.ASSIGN_SUBTRACT;
}

export function NodeKind_isLiteral(self: NodeKind): boolean {
	return self >= NodeKind.BOOL && self <= NodeKind.INT;
}

export function NodeKind_isUnary(self: NodeKind): boolean {
	return self >= NodeKind.NEGATIVE && self <= NodeKind.POSTFIX_INCREMENT;
}

export function NodeKind_isUnaryPrefix(self: NodeKind): boolean {
	return self >= NodeKind.NEGATIVE && self <= NodeKind.PREFIX_INCREMENT;
}

export function NodeKind_isUnaryPostfix(self: NodeKind): boolean {
	return self >= NodeKind.POSTFIX_DECREMENT && self <= NodeKind.POSTFIX_INCREMENT;
}

export function NodeKind_isUnaryAssign(self: NodeKind): boolean {
	return self >= NodeKind.PREFIX_DECREMENT && self <= NodeKind.POSTFIX_INCREMENT;
}

export function NodeKind_isBinary(self: NodeKind): boolean {
	return self >= NodeKind.ADD && self <= NodeKind.ASSIGN_SUBTRACT;
}

export function NodeKind_isBinaryAssign(self: NodeKind): boolean {
	return self >= NodeKind.ASSIGN && self <= NodeKind.ASSIGN_SUBTRACT;
}

export function NodeKind_isJump(self: NodeKind): boolean {
	return self === NodeKind.BREAK || self === NodeKind.CONTINUE || self === NodeKind.DISCARD || self === NodeKind.RETURN;
}

export function NodeKind_isLoop(self: NodeKind): boolean {
	return self === NodeKind.DO_WHILE || self === NodeKind.FOR || self === NodeKind.WHILE;
}
