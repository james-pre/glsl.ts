import { ExtensionBehavior, extensionBehaviors } from './compiler.js';
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
	public id: number;
	public kind: NodeKind;
	public range: Range;
	public internalRange: Range;
	public symbol: BaseSymbol;
	public resolvedType: Type;
	protected _literal: number;
	protected _text: string;
	protected _parent: Node;
	protected _firstChild: Node;
	protected _lastChild: Node;
	protected _previousSibling: Node;
	protected _nextSibling: Node;
	public hasControlFlowAtEnd: boolean;

	public constructor(kind: NodeKind) {
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

	protected _copyMembersFrom(node: Node): void {
		this.kind = node.kind;
		this.range = node.range;
		this.internalRange = node.internalRange;
		this.symbol = node.symbol;
		this.resolvedType = node.resolvedType;
		this._literal = node._literal;
		this._text = node._text;
	}

	public cloneWithoutChildren(): Node {
		const clone = new Node(this.kind);
		clone._copyMembersFrom(this);
		return clone;
	}

	// When used with become(), this provides a convenient way to wrap a node in
	// an operation without the caller needing to be aware of replaceWith():
	//
	//  node.become(Node.createUnary(.NOT, node.cloneAndStealChildren))
	//
	public cloneAndStealChildren(): Node {
		const clone = this.cloneWithoutChildren();

		while (this.hasChildren()) {
			clone.appendChild(this._firstChild.remove());
		}

		return clone;
	}

	public clone(): Node {
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
	public become(node: Node): void {
		if (node === this) {
			return;
		}

		console.assert(node._parent === null);
		this._copyMembersFrom(node);
		this.removeChildren();
		this.appendChildrenFrom(node);
	}

	public parent(): Node {
		return this._parent;
	}

	public firstChild(): Node {
		return this._firstChild;
	}

	public lastChild(): Node {
		return this._lastChild;
	}

	public previousSibling(): Node {
		return this._previousSibling;
	}

	public nextSibling(): Node {
		return this._nextSibling;
	}

	// This is cheaper than childCount == 0
	public hasChildren(): boolean {
		return this._firstChild !== null;
	}

	// This is cheaper than childCount == 1
	public hasOneChild(): boolean {
		return this.hasChildren() && this._firstChild === this._lastChild;
	}

	public childCount(): number {
		let count = 0;

		for (let child = this._firstChild; child !== null; child = child._nextSibling) {
			count = count + 1;
		}

		return count;
	}

	public childAt(index: number): Node {
		console.assert(0 <= index && index < this.childCount());
		let child = this._firstChild;

		while (index !== 0) {
			child = child._nextSibling;
			index = index - 1;
		}

		return child;
	}

	public withType(value: Type): Node {
		this.resolvedType = value;
		return this;
	}

	public withSymbol(value: BaseSymbol): Node {
		this.symbol = value;
		return this;
	}

	public withBool(value: boolean): Node {
		this._literal = +!!value;
		return this;
	}

	public withInt(value: number): Node {
		this._literal = value;
		return this;
	}

	public withFloat(value: number): Node {
		this._literal = value;
		return this;
	}

	public withText(value: string): Node {
		this._text = value;
		return this;
	}

	public withRange(value: Range): Node {
		this.range = value;
		return this;
	}

	public withInternalRange(value: Range): Node {
		this.internalRange = value;
		return this;
	}

	public appendChild(node: Node): Node {
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

	public appendChildrenFrom(node: Node): Node {
		console.assert(node !== this);

		while (node.hasChildren()) {
			this.appendChild(node._firstChild.remove());
		}

		return this;
	}

	public remove(): Node {
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

	public removeChildren(): void {
		while (this.hasChildren()) {
			this._firstChild.remove();
		}
	}

	public replaceWith(node: Node): Node {
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

	public insertChildBefore(after: Node, before: Node): Node {
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

	public replaceWithChildren(): void {
		while (this.hasChildren()) {
			this.parent().insertChildBefore(this.nextSibling(), this.lastChild().remove());
		}

		this.remove();
	}

	public isTrue(): boolean {
		return this.kind === NodeKind.BOOL && this.asBool();
	}

	public isFalse(): boolean {
		return this.kind === NodeKind.BOOL && !this.asBool();
	}

	public isIntOrFloat(value: number): boolean {
		return (this.kind === NodeKind.INT && this.asInt() === value) || (this.kind === NodeKind.FLOAT && this.asFloat() === value);
	}

	public isCallTarget(): boolean {
		return this.parent() !== null && this.parent().kind === NodeKind.CALL && this.parent().callTarget() === this;
	}

	public isAssignTarget(): boolean {
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

	public isUsedInStorage(): boolean {
		if (this.isAssignTarget()) {
			return true;
		}

		if (this.parent() !== null && (this.parent().kind === NodeKind.DOT || this.parent().kind === NodeKind.INDEX)) {
			return this.parent().isUsedInStorage();
		}

		return false;
	}

	public isEmptyBlock(): boolean {
		return this.kind === NodeKind.BLOCK && !this.hasChildren();
	}

	public isEmptySequence(): boolean {
		return this.kind === NodeKind.SEQUENCE && !this.hasChildren();
	}

	public isNumberLessThanZero(): boolean {
		return (this.kind === NodeKind.INT && this.asInt() < 0) || (this.kind === NodeKind.FLOAT && this.asFloat() < 0);
	}

	public hasNoSideEffects(): boolean {
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

	public invertBooleanCondition(): void {
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

	public looksTheSameAs(node: Node): boolean {
		if (this.kind != node.kind) {
			return false;
		}
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

	public variableInitializer(): Node {
		console.assert(this.kind === NodeKind.VARIABLE);
		console.assert(this.childCount() <= 1);
		return this._firstChild;
	}

	public doWhileBody(): Node {
		console.assert(this.kind === NodeKind.DO_WHILE);
		console.assert(this.childCount() === 2);
		console.assert(NodeKind_isStatement(this._firstChild.kind));
		return this._firstChild;
	}

	public doWhileTest(): Node {
		console.assert(this.kind === NodeKind.DO_WHILE);
		console.assert(this.childCount() === 2);
		console.assert(NodeKind_isExpression(this._lastChild.kind));
		return this._lastChild;
	}

	public expressionValue(): Node {
		console.assert(this.kind === NodeKind.EXPRESSION);
		console.assert(this.childCount() === 1);
		console.assert(NodeKind_isExpression(this._firstChild.kind));
		return this._firstChild;
	}

	public extensionName(): string {
		console.assert(this.kind === NodeKind.EXTENSION);
		console.assert(this.childCount() === 0);
		console.assert(this._text !== null);
		return this._text;
	}

	public extensionBehavior(): ExtensionBehavior {
		console.assert(this.kind === NodeKind.EXTENSION);
		console.assert(this.childCount() === 0);
		return extensionBehaviors[this._literal | 0];
	}

	public forSetup(): Node {
		console.assert(this.kind === NodeKind.FOR);
		console.assert(this.childCount() === 4);
		console.assert(NodeKind_isExpression(this._firstChild.kind) || this._firstChild.kind === NodeKind.VARIABLES);
		return this._firstChild.isEmptySequence() ? null : this._firstChild;
	}

	public forTest(): Node {
		console.assert(this.kind === NodeKind.FOR);
		console.assert(this.childCount() === 4);
		console.assert(NodeKind_isExpression(this._firstChild._nextSibling.kind) || this._firstChild._nextSibling.kind === NodeKind.VARIABLES);
		return this._firstChild._nextSibling.isEmptySequence() ? null : this._firstChild._nextSibling;
	}

	public forUpdate(): Node {
		console.assert(this.kind === NodeKind.FOR);
		console.assert(this.childCount() === 4);
		console.assert(NodeKind_isExpression(this._lastChild._previousSibling.kind));
		return this._lastChild._previousSibling.isEmptySequence() ? null : this._lastChild._previousSibling;
	}

	public forBody(): Node {
		console.assert(this.kind === NodeKind.FOR);
		console.assert(this.childCount() === 4);
		console.assert(NodeKind_isStatement(this._lastChild.kind));
		return this._lastChild;
	}

	public ifTest(): Node {
		console.assert(this.kind === NodeKind.IF);
		console.assert(this.childCount() === 2 || this.childCount() === 3);
		console.assert(NodeKind_isExpression(this._firstChild.kind));
		return this._firstChild;
	}

	public ifTrue(): Node {
		console.assert(this.kind === NodeKind.IF);
		console.assert(this.childCount() === 2 || this.childCount() === 3);
		console.assert(NodeKind_isStatement(this._firstChild._nextSibling.kind));
		return this._firstChild._nextSibling;
	}

	public ifFalse(): Node {
		console.assert(this.kind === NodeKind.IF);
		console.assert(this.childCount() === 2 || this.childCount() === 3);
		console.assert(this._firstChild._nextSibling._nextSibling === null || NodeKind_isStatement(this._firstChild._nextSibling._nextSibling.kind));
		return this._firstChild._nextSibling._nextSibling;
	}

	public precisionFlag(): SymbolFlags {
		console.assert(this.kind === NodeKind.PRECISION);
		console.assert(this.childCount() === 1);
		return this._literal | 0;
	}

	public precisionType(): Node {
		console.assert(this.kind === NodeKind.PRECISION);
		console.assert(this.childCount() === 1);
		console.assert(NodeKind_isExpression(this._firstChild.kind));
		return this._firstChild;
	}

	public returnValue(): Node {
		console.assert(this.kind === NodeKind.RETURN);
		console.assert(this.childCount() <= 1);
		console.assert(this._firstChild === null || NodeKind_isExpression(this._firstChild.kind));
		return this._firstChild;
	}

	public variablesFlags(): SymbolFlags {
		console.assert(this.kind === NodeKind.VARIABLES);
		console.assert(this.childCount() >= 1);
		return this._literal | 0;
	}

	public variablesType(): Node {
		console.assert(this.kind === NodeKind.VARIABLES);
		console.assert(this.childCount() >= 1);
		console.assert(NodeKind_isExpression(this._firstChild.kind));
		return this._firstChild;
	}

	public structBlock(): Node {
		console.assert(this.kind === NodeKind.STRUCT);
		console.assert(this.childCount() === 1 || this.childCount() === 2);
		console.assert(this._firstChild.kind === NodeKind.STRUCT_BLOCK);
		return this._firstChild;
	}

	public structVariables(): Node {
		console.assert(this.kind === NodeKind.STRUCT);
		console.assert(this.childCount() === 1 || this.childCount() === 2);
		console.assert(this._firstChild._nextSibling === null || this._firstChild._nextSibling.kind === NodeKind.VARIABLES);
		return this._firstChild._nextSibling;
	}

	public versionNumber(): number {
		console.assert(this.kind === NodeKind.VERSION);
		console.assert(this.childCount() === 0);
		return this._literal | 0;
	}

	public whileTest(): Node {
		console.assert(this.kind === NodeKind.WHILE);
		console.assert(this.childCount() === 2);
		console.assert(NodeKind_isExpression(this._firstChild.kind));
		return this._firstChild;
	}

	public whileBody(): Node {
		console.assert(this.kind === NodeKind.WHILE);
		console.assert(this.childCount() === 2);
		console.assert(NodeKind_isStatement(this._lastChild.kind));
		return this._lastChild;
	}

	public callTarget(): Node {
		console.assert(this.kind === NodeKind.CALL);
		console.assert(this.childCount() >= 1);
		console.assert(NodeKind_isExpression(this._firstChild.kind));
		return this._firstChild;
	}

	public dotTarget(): Node {
		console.assert(this.kind === NodeKind.DOT);
		console.assert(this.childCount() === 1);
		console.assert(NodeKind_isExpression(this._firstChild.kind));
		return this._firstChild;
	}

	public hookTest(): Node {
		console.assert(this.kind === NodeKind.HOOK);
		console.assert(this.childCount() === 3);
		console.assert(NodeKind_isExpression(this._firstChild.kind));
		return this._firstChild;
	}

	public hookTrue(): Node {
		console.assert(this.kind === NodeKind.HOOK);
		console.assert(this.childCount() === 3);
		console.assert(NodeKind_isExpression(this._firstChild._nextSibling.kind));
		return this._firstChild._nextSibling;
	}

	public hookFalse(): Node {
		console.assert(this.kind === NodeKind.HOOK);
		console.assert(this.childCount() === 3);
		console.assert(NodeKind_isExpression(this._lastChild.kind));
		return this._lastChild;
	}

	public asString(): string {
		console.assert(this.kind === NodeKind.DOT);
		console.assert(this._text !== null);
		return this._text;
	}

	public asBool(): boolean {
		console.assert(this.kind === NodeKind.BOOL);
		return !!this._literal;
	}

	public asFloat(): number {
		console.assert(this.kind === NodeKind.FLOAT);
		return this._literal;
	}

	public asInt(): number {
		console.assert(this.kind === NodeKind.INT);
		return this._literal | 0;
	}

	public unaryValue(): Node {
		console.assert(NodeKind_isUnary(this.kind));
		console.assert(this.childCount() === 1);
		console.assert(NodeKind_isExpression(this._firstChild.kind));
		return this._firstChild;
	}

	public binaryLeft(): Node {
		console.assert(NodeKind_isBinary(this.kind));
		console.assert(this.childCount() === 2);
		console.assert(NodeKind_isExpression(this._firstChild.kind));
		return this._firstChild;
	}

	public binaryRight(): Node {
		console.assert(NodeKind_isBinary(this.kind));
		console.assert(this.childCount() === 2);
		console.assert(NodeKind_isExpression(this._lastChild.kind));
		return this._lastChild;
	}

	public static createGlobal(): Node {
		return new Node(NodeKind.GLOBAL);
	}

	public static createStructBlock(): Node {
		return new Node(NodeKind.STRUCT_BLOCK);
	}

	public static createVariable(symbol: VariableSymbol, value: Node): Node {
		return new Node(NodeKind.VARIABLE).withSymbol(symbol as BaseSymbol).appendChild(value);
	}

	public static createBlock(): Node {
		return new Node(NodeKind.BLOCK);
	}

	public static createBreak(): Node {
		return new Node(NodeKind.BREAK);
	}

	public static createContinue(): Node {
		return new Node(NodeKind.CONTINUE);
	}

	public static createDiscard(): Node {
		return new Node(NodeKind.DISCARD);
	}

	public static createDoWhile(body: Node, test: Node): Node {
		console.assert(NodeKind_isStatement(body.kind));
		console.assert(NodeKind_isExpression(test.kind));
		return new Node(NodeKind.DO_WHILE).appendChild(body).appendChild(test);
	}

	public static createExpression(value: Node): Node {
		console.assert(NodeKind_isExpression(value.kind));
		return new Node(NodeKind.EXPRESSION).appendChild(value);
	}

	public static createExtension(name: string, behavior: ExtensionBehavior): Node {
		return new Node(NodeKind.EXTENSION).withText(name).withInt(extensionBehaviors.indexOf(behavior));
	}

	public static createFor(setup: Node, test: Node, update: Node, body: Node): Node {
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

	public static createFunction(symbol: FunctionSymbol): Node {
		return new Node(NodeKind.FUNCTION).withSymbol(symbol as BaseSymbol);
	}

	public static createIf(test: Node, yes: Node, no: Node): Node {
		console.assert(NodeKind_isExpression(test.kind));
		console.assert(NodeKind_isStatement(yes.kind));
		console.assert(no === null || NodeKind_isStatement(no.kind));
		return new Node(NodeKind.IF).appendChild(test).appendChild(yes).appendChild(no);
	}

	public static createModifierBlock(): Node {
		return new Node(NodeKind.MODIFIER_BLOCK);
	}

	public static createPrecision(flags: number, type: Node): Node {
		console.assert(NodeKind_isExpression(type.kind));
		return new Node(NodeKind.PRECISION).withInt(flags).appendChild(type);
	}

	public static createReturn(value: Node): Node {
		console.assert(value === null || NodeKind_isExpression(value.kind));
		return new Node(NodeKind.RETURN).appendChild(value);
	}

	public static createStruct(symbol: StructSymbol, block: Node, variables: Node): Node {
		console.assert(block.kind === NodeKind.STRUCT_BLOCK);
		console.assert(variables === null || variables.kind === NodeKind.VARIABLES);
		return new Node(NodeKind.STRUCT)
			.withSymbol(symbol as BaseSymbol)
			.appendChild(block)
			.appendChild(variables);
	}

	public static createVariables(flags: number, type: Node): Node {
		console.assert(NodeKind_isExpression(type.kind));
		return new Node(NodeKind.VARIABLES).withInt(flags).appendChild(type);
	}

	public static createVersion(version: number): Node {
		return new Node(NodeKind.VERSION).withInt(version);
	}

	public static createWhile(test: Node, body: Node): Node {
		console.assert(NodeKind_isExpression(test.kind));
		console.assert(NodeKind_isStatement(body.kind));
		return new Node(NodeKind.WHILE).appendChild(test).appendChild(body);
	}

	public static createCall(value: Node): Node {
		console.assert(NodeKind_isExpression(value.kind));
		return new Node(NodeKind.CALL).appendChild(value);
	}

	public static createConstructorCall(type: Type): Node {
		return Node.createCall(Node.createType(type)).withType(type);
	}

	public static createDot(value: Node, text: string): Node {
		console.assert(NodeKind_isExpression(value.kind));
		console.assert(text !== null);
		return new Node(NodeKind.DOT).appendChild(value).withText(text);
	}

	public static createHook(test: Node, yes: Node, no: Node): Node {
		console.assert(NodeKind_isExpression(test.kind));
		console.assert(NodeKind_isExpression(yes.kind));
		console.assert(NodeKind_isExpression(no.kind));
		return new Node(NodeKind.HOOK).appendChild(test).appendChild(yes).appendChild(no);
	}

	public static createName(symbol: BaseSymbol): Node {
		return new Node(NodeKind.NAME).withSymbol(symbol);
	}

	public static createParseError(): Node {
		return new Node(NodeKind.PARSE_ERROR).withType(Type.ERROR);
	}

	public static createSequence(): Node {
		return new Node(NodeKind.SEQUENCE);
	}

	public static createType(type: Type): Node {
		return new Node(NodeKind.TYPE).withType(type);
	}

	public static createUnknownConstant(type: Type): Node {
		return new Node(NodeKind.UNKNOWN_CONSTANT).withType(type);
	}

	public static createBool(value: boolean): Node {
		return new Node(NodeKind.BOOL).withBool(value).withType(Type.BOOL);
	}

	public static createInt(value: number): Node {
		return new Node(NodeKind.INT).withInt(value).withType(Type.INT);
	}

	public static createFloat(value: number): Node {
		return new Node(NodeKind.FLOAT).withFloat(value).withType(Type.FLOAT);
	}

	public static createUnary(kind: NodeKind, value: Node): Node {
		console.assert(NodeKind_isUnary(kind));
		return new Node(kind).appendChild(value);
	}

	public static createBinary(kind: NodeKind, left: Node, right: Node): Node {
		console.assert(NodeKind_isBinary(kind));
		return new Node(kind).appendChild(left).appendChild(right);
	}

	protected static _nextID = 0;

	protected static _createID(): number {
		Node._nextID = Node._nextID + 1;
		return Node._nextID;
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
