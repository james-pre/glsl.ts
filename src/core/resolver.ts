import { List_first, assert, StringMap_set2, List_removeIf, List_get2, string_get5, string_slice22 } from '../native-js.js';
import { API_NAME } from './api.js';
import { CompilerData, ExtensionBehavior } from './compiler.js';
import { ControlFlowAnalyzer } from './controlflow.js';
import { fold } from './folder.js';
import { Log } from './log.js';
import { Node, NodeKind, NodeKind_isBinary, NodeKind_isBinaryAssign, NodeKind_isExpression, NodeKind_isStatement, NodeKind_isUnary, NodeKind_isUnaryAssign } from './node.js';
import { Range } from './range.js';
import { strings, type } from './swizzle.js';
import { FunctionSymbol, VariableKind, _Symbol } from './symbol.js';
import { Type } from './type.js';

export class Resolver {
	_log: Log;
	_data: CompilerData;
	_controlFlow: ControlFlowAnalyzer;
	_versions: Array<Node>;
	_generatedExtensions: Map<string, Node>;
	_returnType: Type;

	resolveGlobal(global: Node): void {
		this.resolveNode(global);

		// Remove all version statements
		for (const version of this._versions) {
			version.remove();
		}

		// Re-insert the first version statement
		let first = global.firstChild();

		if (!(this._versions.length === 0)) {
			global.insertChildBefore(first, List_first(this._versions));
		}

		// Insert all automatically generated extensions
		for (const extension of Array.from(this._generatedExtensions.values())) {
			global.insertChildBefore(first, extension);
		}

		// Constants may end up being marked as unused because they are resolved
		// early during parsing due to how the language works. However, we don't
		// want them to show up as unused in the IDE. Post-process the unused
		// symbol list to filter out constants that were later used.
		this._log.unusedSymbols = this._log.unusedSymbols.filter((x: _Symbol) => {
			return x.useCount === 0;
		});
	}

	_maybeMarkAsUnused(symbol: _Symbol): void {
		if (symbol.range.source.name !== API_NAME && symbol.useCount === 0 && !symbol.isExported()) {
			this._log.unusedSymbols.push(symbol);
		}
	}

	resolveNode(node: Node): void {
		if (node.resolvedType !== null) {
			return;
		}

		node.resolvedType = Type.ERROR;
		let kind = node.kind;

		switch (kind) {
			case NodeKind.GLOBAL:
			case NodeKind.STRUCT_BLOCK: {
				this._resolveChildren(node);
				break;
			}

			case NodeKind.VARIABLE: {
				let symbol = node.symbol.asVariable();
				this._maybeMarkAsUnused(symbol as _Symbol);
				this.resolveNode(symbol.type);

				// Variables must have a type
				let type = symbol.type.resolvedType;

				if (type === Type.VOID) {
					this._log.semanticErrorBadVariableType(symbol.type.range, type);
					type = Type.ERROR;
				}

				// Array size
				if (symbol.arrayCount !== null) {
					this._resolveAsExpression(symbol.arrayCount);
					this.checkConversion(symbol.arrayCount, Type.INT);
				}

				// Initial value
				if (symbol.value() !== null) {
					this._resolveAsExpression(symbol.value());
					this.checkConversion(symbol.value(), type);

					if (type.containsArray) {
						this._log.semanticErrorArrayAssignment(node.internalRange, type);
					}
				}

				// Constants must be initialized
				if (symbol.isConst()) {
					if (symbol.value() !== null) {
						if (symbol.value().resolvedType !== Type.ERROR) {
							let folded = fold(symbol.value());

							if (folded === null) {
								this._log.syntaxErrorConstantRequired(symbol.value().range);
							} else {
								assert(folded.parent() === null);
								assert(folded.resolvedType !== null);
								symbol.constantValue = folded;
							}
						}
					} else if (symbol.kind === VariableKind.LOCAL) {
						this._log.semanticErrorUninitializedConstant(symbol.range);
					}
				}
				break;
			}

			case NodeKind.BLOCK: {
				this._resolveBlockOrStatement(node);
				break;
			}

			case NodeKind.BREAK:
			case NodeKind.CONTINUE:
			case NodeKind.DISCARD: {
				break;
			}

			case NodeKind.DO_WHILE: {
				this._resolveBlockOrStatement(node.doWhileBody());
				this.resolveNode(node.doWhileTest());
				this.checkConversion(node.doWhileTest(), Type.BOOL);
				break;
			}

			case NodeKind.EXPRESSION: {
				this.resolveNode(node.expressionValue());
				break;
			}

			case NodeKind.EXTENSION: {
				break;
			}

			case NodeKind.FOR: {
				if (node.forSetup() !== null) {
					this._resolveAsExpression(node.forSetup());
				}

				if (node.forTest() !== null) {
					this._resolveAsExpression(node.forTest());
					this.checkConversion(node.forTest(), Type.BOOL);
				}

				if (node.forUpdate() !== null) {
					this._resolveAsExpression(node.forUpdate());
				}

				this._resolveBlockOrStatement(node.forBody());
				break;
			}

			case NodeKind.FUNCTION: {
				let symbol1 = node.symbol.asFunction();
				this._maybeMarkAsUnused(symbol1 as _Symbol);

				for (const argument of symbol1._arguments) {
					this.resolveNode(argument.type);
				}

				this.resolveNode(symbol1.returnType);

				if (symbol1.block !== null) {
					this._returnType = symbol1.returnType.resolvedType;
					this._resolveBlockOrStatement(symbol1.block);

					// Missing a return statement is an error
					if (this._returnType !== null && this._returnType !== Type.VOID && symbol1.block.hasControlFlowAtEnd) {
						this._log.semanticErrorMissingReturn(symbol1.range, symbol1.name, this._returnType);
					}

					this._returnType = null;
				}
				break;
			}

			case NodeKind.IF: {
				this.resolveNode(node.ifTest());
				this.checkConversion(node.ifTest(), Type.BOOL);
				this._resolveBlockOrStatement(node.ifTrue());

				if (node.ifFalse() !== null) {
					this._resolveBlockOrStatement(node.ifFalse());
				}
				break;
			}

			case NodeKind.PRECISION: {
				break;
			}

			case NodeKind.RETURN: {
				if (node.returnValue() !== null) {
					this.resolveNode(node.returnValue());
					this.checkConversion(node.returnValue(), this._returnType !== null ? this._returnType : Type.ERROR);
				} else {
					node.resolvedType = Type.VOID;
					this.checkConversion(node, this._returnType !== null ? this._returnType : Type.ERROR);
				}
				break;
			}

			case NodeKind.STRUCT: {
				let symbol2 = node.symbol.asStruct();
				this._maybeMarkAsUnused(symbol2 as _Symbol);
				this._resolveChildren(node);

				// A struct loses operator "==" and "!=" when it contains a type without those operators
				let resolvedType = symbol2.resolvedType();

				for (const variable of symbol2.asStruct().variables) {
					let type1 = variable.type.resolvedType;

					if (type1.containsArray) {
						resolvedType.containsArray = true;
					}

					if (type1.containsSampler) {
						resolvedType.containsSampler = true;
					}
				}
				break;
			}

			case NodeKind.VARIABLES: {
				this._resolveChildren(node);
				break;
			}

			case NodeKind.VERSION: {
				this._versions.push(node);
				break;
			}

			case NodeKind.WHILE: {
				this.resolveNode(node.whileTest());
				this.checkConversion(node.whileTest(), Type.BOOL);
				this._resolveBlockOrStatement(node.whileBody());
				break;
			}

			case NodeKind.CALL: {
				this._resolveCall(node);
				break;
			}

			case NodeKind.DOT: {
				this._resolveDot(node);
				break;
			}

			case NodeKind.HOOK: {
				let test = node.hookTest();
				let no = node.hookFalse();
				let yes = node.hookTrue();
				this._resolveAsExpression(test);
				this.checkConversion(test, Type.BOOL);
				this._resolveAsExpression(yes);
				this._resolveAsExpression(no);

				if (yes.resolvedType !== no.resolvedType) {
					this._log.semanticErrorBadHookTypes(Range.span(yes.range, no.range), yes.resolvedType, no.resolvedType);
				} else if (yes.resolvedType.containsArray) {
					this._log.semanticErrorArrayHook(Range.span(yes.range, no.range), yes.resolvedType);
				} else {
					node.resolvedType = yes.resolvedType;
				}
				break;
			}

			case NodeKind.NAME: {
				let symbol3 = node.symbol;

				if (symbol3.isVariable()) {
					this.resolveNode(symbol3.asVariable().type);
					node.resolvedType = symbol3.asVariable().type.resolvedType;
				} else if (symbol3.isFunction() && !node.isCallTarget()) {
					this._log.semanticErrorMustCallFunction(node.range, symbol3.name);
				} else {
					node.resolvedType = symbol3.resolvedType();
				}

				// Make sure the extension is enabled if it hasn't been specified
				let name = symbol3.requiredExtension;

				if (name !== null && !this._generatedExtensions.has(name) && this._data.extensionBehavior(name) === ExtensionBehavior.DEFAULT) {
					StringMap_set2(this._generatedExtensions, name, Node.createExtension(name, ExtensionBehavior.ENABLE));
				}
				break;
			}

			case NodeKind.SEQUENCE: {
				for (let child = node.firstChild(); child !== null; child = child.nextSibling()) {
					this._resolveAsExpression(child);
				}

				node.resolvedType = node.lastChild().resolvedType;
				break;
			}

			default: {
				if (NodeKind_isUnary(kind)) {
					this._resolveUnary(node);
				} else if (NodeKind_isBinary(kind)) {
					this._resolveBinary(node);
				} else {
					assert(false);
				}
				break;
			}
		}

		assert(node.resolvedType !== null);
	}

	_resolveBlockOrStatement(node: Node): void {
		assert(NodeKind_isStatement(node.kind));
		this._controlFlow.pushBlock(node);

		if (node.kind === NodeKind.BLOCK) {
			for (let child = node.firstChild(); child !== null; child = child.nextSibling()) {
				this.resolveNode(child);
				this._controlFlow.visitStatement(child);
			}
		} else {
			this.resolveNode(node);
			this._controlFlow.visitStatement(node);
		}

		this._controlFlow.popBlock(node);
	}

	_resolveUnary(node: Node): void {
		let value = node.unaryValue();
		this._resolveAsExpression(value);

		if (NodeKind_isUnaryAssign(node.kind)) {
			this._checkStorage(value);
		}

		let valueType = value.resolvedType;

		switch (node.kind) {
			case NodeKind.NEGATIVE:
			case NodeKind.POSITIVE:
			case NodeKind.PREFIX_DECREMENT:
			case NodeKind.PREFIX_INCREMENT:
			case NodeKind.POSTFIX_DECREMENT:
			case NodeKind.POSTFIX_INCREMENT: {
				node.resolvedType = valueType.isIntOrFloat() ? valueType : Type.ERROR;
				break;
			}

			case NodeKind.NOT: {
				node.resolvedType = valueType === Type.BOOL ? Type.BOOL : Type.ERROR;
				break;
			}
		}

		if (node.resolvedType === Type.ERROR && valueType !== Type.ERROR) {
			this._log.semanticErrorBadUnaryOperator(node.internalRange, node.internalRange.toString(), valueType);
		}
	}

	_resolveBinary(node: Node): void {
		let left = node.binaryLeft();
		let right = node.binaryRight();
		this._resolveAsExpression(left);
		this._resolveAsExpression(right);

		if (NodeKind_isBinaryAssign(node.kind)) {
			this._checkStorage(left);
		}

		let leftType = left.resolvedType;
		let rightType = right.resolvedType;
		let isSame = leftType === rightType;

		switch (node.kind) {
			case NodeKind.ADD:
			case NodeKind.SUBTRACT:
			case NodeKind.MULTIPLY:
			case NodeKind.DIVIDE: {
				node.resolvedType =
					isSame && leftType.componentType() !== null
						? leftType
						: leftType.hasFloatComponents() && rightType === Type.FLOAT
							? leftType
							: leftType.hasIntComponents() && rightType === Type.INT
								? leftType
								: leftType === Type.FLOAT && rightType.hasFloatComponents()
									? rightType
									: leftType === Type.INT && rightType.hasIntComponents()
										? rightType
										: node.kind === NodeKind.MULTIPLY &&
											  ((leftType === Type.VEC2 && rightType === Type.MAT2) || (leftType === Type.MAT2 && rightType === Type.VEC2))
											? Type.VEC2
											: node.kind === NodeKind.MULTIPLY &&
												  ((leftType === Type.VEC3 && rightType === Type.MAT3) || (leftType === Type.MAT3 && rightType === Type.VEC3))
												? Type.VEC3
												: node.kind === NodeKind.MULTIPLY &&
													  ((leftType === Type.VEC4 && rightType === Type.MAT4) || (leftType === Type.MAT4 && rightType === Type.VEC4))
													? Type.VEC4
													: Type.ERROR;
				break;
			}

			case NodeKind.EQUAL:
			case NodeKind.NOT_EQUAL: {
				node.resolvedType = isSame && leftType.canUseEqualityOperators() ? Type.BOOL : Type.ERROR;
				break;
			}

			case NodeKind.LOGICAL_AND:
			case NodeKind.LOGICAL_OR:
			case NodeKind.LOGICAL_XOR: {
				node.resolvedType = isSame && leftType === Type.BOOL ? Type.BOOL : Type.ERROR;
				break;
			}

			case NodeKind.LESS_THAN:
			case NodeKind.LESS_THAN_OR_EQUAL:
			case NodeKind.GREATER_THAN:
			case NodeKind.GREATER_THAN_OR_EQUAL: {
				node.resolvedType = isSame && (leftType === Type.FLOAT || leftType === Type.INT) ? Type.BOOL : Type.ERROR;
				break;
			}

			case NodeKind.ASSIGN: {
				node.resolvedType = leftType;

				if (leftType.containsArray) {
					this._log.semanticErrorArrayAssignment(node.internalRange, leftType);
				}

				this.checkConversion(right, leftType);
				return;
			}

			case NodeKind.ASSIGN_ADD:
			case NodeKind.ASSIGN_SUBTRACT:
			case NodeKind.ASSIGN_MULTIPLY:
			case NodeKind.ASSIGN_DIVIDE: {
				node.resolvedType =
					isSame && leftType.componentType() !== null
						? leftType
						: leftType.hasFloatComponents() && rightType === Type.FLOAT
							? leftType
							: leftType.hasIntComponents() && rightType === Type.INT
								? leftType
								: node.kind === NodeKind.ASSIGN_MULTIPLY &&
									  ((leftType === Type.VEC2 && rightType === Type.MAT2) ||
											(leftType === Type.VEC3 && rightType === Type.MAT3) ||
											(leftType === Type.VEC4 && rightType === Type.MAT4))
									? leftType
									: Type.ERROR;
				break;
			}

			case NodeKind.INDEX: {
				if (rightType === Type.INT) {
					let indexType = leftType.indexType();

					if (indexType !== null) {
						node.resolvedType = indexType;
					}

					// Run bounds checking on the constant-folded value
					let folded = fold(right);

					if (folded !== null && folded.kind === NodeKind.INT) {
						let value = folded.asInt();
						let count = leftType.indexCount();

						// Negative indices are always invalid even if the array size is unknown
						if (value < 0 || (count !== 0 && value >= count)) {
							this._log.semanticErrorOutOfBoundsIndex(right.range, value, leftType);
						}
					}
				}
				break;
			}
		}

		// If we get here, show an error about an invalid operator
		if (node.resolvedType === Type.ERROR && leftType !== Type.ERROR && rightType !== Type.ERROR) {
			if (node.kind === NodeKind.INDEX) {
				this._log.semanticErrorBadIndex(node.internalRange, leftType, rightType);
			} else {
				this._log.semanticErrorBadBinaryOperator(node.internalRange, node.internalRange.toString(), leftType, rightType);
			}
		}
	}

	_resolveCall(node: Node): void {
		let callTarget = node.callTarget();
		this.resolveNode(callTarget);
		let type = callTarget.resolvedType;
		let symbol = type.symbol;
		let _arguments: Array<Node> = [];
		let hasError = false;

		for (let child = callTarget.nextSibling(); child !== null; child = child.nextSibling()) {
			this._resolveAsExpression(child);
			_arguments.push(child);

			if (child.resolvedType === Type.ERROR) {
				hasError = true;
			}
		}

		if (hasError) {
			return;
		}

		if (symbol !== null) {
			if (symbol.isFunction()) {
				this._resolveFunctionOverloads(symbol.asFunction(), node, _arguments);
				return;
			}

			if (symbol.isStruct()) {
				this._resolveConstructor(type, node, _arguments);
				return;
			}
		}

		if (type !== Type.ERROR) {
			this._log.semanticErrorBadCall(callTarget.range, type);
		}
	}

	_resolveDot(node: Node): void {
		let dotTarget = node.dotTarget();
		let name = node.asString();
		let range = node.internalRange;
		this._resolveAsExpression(dotTarget);

		if (name === '') {
			// Ignore this case since the error was already reported
			return;
		}

		let type = dotTarget.resolvedType;
		let isAssignTarget = node.isAssignTarget();
		let value = type;

		if (
			value === Type.BVEC2 ||
			value === Type.IVEC2 ||
			value === Type.VEC2 ||
			value === Type.BVEC3 ||
			value === Type.IVEC3 ||
			value === Type.VEC3 ||
			value === Type.BVEC4 ||
			value === Type.IVEC4 ||
			value === Type.VEC4
		) {
			node.resolvedType = this._validateSwizzle(range, type, name, isAssignTarget);
		} else if (value === Type.ERROR) {
			// Ignore this case since the error was already reported
		} else {
			if (type.symbol !== null && type.symbol.isStruct()) {
				for (const variable of type.symbol.asStruct().variables) {
					if (variable.name === name) {
						node.symbol = variable as _Symbol;
						this.resolveNode(variable.type);
						node.resolvedType = variable.type.resolvedType;
						break;
					}
				}
			}

			if (node.symbol === null) {
				this._log.semanticErrorBadMember(range, type, name);
			}
		}
	}

	_resolveFunctionOverloads(overloaded: FunctionSymbol, node: Node, _arguments: Array<Node>): void {
		let overloads: Array<FunctionSymbol> = [];

		// Collect all relevant overloads but ignore forward-declared functions that also have an implementation
		for (let overload = overloaded; overload !== null; overload = overload.previousOverload) {
			if (!(overloads.indexOf(overload.sibling) !== -1)) {
				overloads.push(overload);
			}
		}

		// Narrow down by argument count
		if (overloads.length !== 1) {
			overloads = overloads.slice();
			List_removeIf(overloads, (overload: FunctionSymbol) => {
				return overload._arguments.length !== _arguments.length;
			});

			// Narrow down by argument types
			if (overloads.length !== 1) {
				let overloadsBeforeTypeFilter = overloads.slice();
				List_removeIf(overloads, (overload: FunctionSymbol) => {
					for (let i = 0, count = _arguments.length; i < count; i = i + 1) {
						if (List_get2(overload._arguments, i).type.resolvedType !== List_get2(_arguments, i).resolvedType) {
							return true;
						}
					}

					return false;
				});

				// Narrow down by argument types with "conversions" to get better error messages
				if (overloads.length !== 1) {
					overloads = overloadsBeforeTypeFilter;
					List_removeIf(overloads, (overload: FunctionSymbol) => {
						for (let i = 0, count = _arguments.length; i < count; i = i + 1) {
							let from = List_get2(overload._arguments, i).type.resolvedType;
							let to = List_get2(_arguments, i).resolvedType;
							let fromSize = from.componentCount();
							let toSize = to.componentCount();

							if (from !== to && (fromSize === 0 || toSize === 0 || fromSize !== toSize)) {
								return true;
							}
						}

						return false;
					});
				}
			}
		}

		// Match failure
		if (overloads.length !== 1) {
			this._log.semanticErrorBadOverloadMatch(node.callTarget().range, overloaded.name);
			return;
		}

		// Match success
		let overload1 = List_first(overloads);

		if (overload1._arguments.length !== _arguments.length) {
			this._log.semanticErrorArgumentCountFunction(node.internalRange, overload1._arguments.length, _arguments.length, overload1.name, overload1.range);
		} else {
			for (let i = 0, count = _arguments.length; i < count; i = i + 1) {
				this.checkConversion(List_get2(_arguments, i), List_get2(overload1._arguments, i).type.resolvedType);
			}
		}

		node.callTarget().symbol = overload1 as _Symbol;
		node.resolvedType = overload1.returnType.resolvedType;
	}

	_resolveConstructor(type: Type, node: Node, _arguments: Array<Node>): void {
		node.resolvedType = type;

		if (type === Type.ERROR) {
			return;
		}

		if (type.componentType() !== null) {
			let count = type.componentCount();
			let hasMatrixArgument = false;

			// Visit each argument and make sure it's useful toward construction
			let providedCount = 0;

			for (const argument of _arguments) {
				let argumentType = argument.resolvedType;
				let deltaCount = argumentType.componentCount();

				// Each type in a component-based types must be able to itself be unpacked into components
				if (argumentType.componentType() === null) {
					if (argumentType !== Type.ERROR) {
						this._log.semanticErrorBadConstructorValue(argument.range, argumentType, type);
					}

					return;
				}

				// Passing extra values to a constructor is allowed sometimes
				//
				// Allowed:
				//
				//   vec3(vec4(1.0));
				//   vec3(1.0, vec4(1.0));
				//
				// Not allowed:
				//
				//   vec3(vec4(1.0), 1.0);
				//   vec3(vec3(1.0), vec3(1.0));
				//
				if (providedCount >= count) {
					this._log.semanticErrorExtraConstructorValue(argument.range, type, count, providedCount + deltaCount);
				}

				if (argumentType.isMatrix()) {
					hasMatrixArgument = true;
				}

				providedCount = providedCount + deltaCount;
			}

			// If a matrix argument is given to a matrix constructor, it is an error
			// to have any other arguments
			let isMatrixMatrixConstructor = type.isMatrix() && hasMatrixArgument;

			if (isMatrixMatrixConstructor && _arguments.length !== 1) {
				this._log.semanticErrorBadMatrixConstructor(node.internalRange);
			}

			// Validate the count (constructing a matrix using a matrix should always work)
			else if (providedCount < count && providedCount !== 1 && !isMatrixMatrixConstructor) {
				this._log.semanticErrorBadConstructorCount(node.internalRange, type, providedCount);
			}

			return;
		}

		let symbol = type.symbol.asStruct();
		let variables = symbol.variables;
		let variableCount = variables.length;
		let argumentCount = _arguments.length;

		// Validate argument count
		if (variableCount !== argumentCount) {
			this._log.semanticErrorArgumentCountConstructor(node.internalRange, variableCount, argumentCount, symbol.name, symbol.range);
			return;
		}

		// Validate argument types
		for (let i = 0, count1 = variableCount; i < count1; i = i + 1) {
			this.checkConversion(List_get2(_arguments, i), List_get2(variables, i).type.resolvedType);
		}
	}

	_validateSwizzle(range: Range, type: Type, name: string, isAssignTarget: boolean): Type {
		let count = name.length;

		if (count < 1 || count > 4) {
			this._log.semanticErrorBadSwizzle(range, type, name);
			return Type.ERROR;
		}

		let componentCount = type.componentCount();

		for (const set of strings(componentCount)) {
			if (set.indexOf(string_get5(name, 0)) !== -1) {
				for (let i = 1, count1 = count; i < count1; i = i + 1) {
					if (!(set.indexOf(string_get5(name, i)) !== -1)) {
						this._log.semanticErrorBadSwizzle(range, type, name);
						return Type.ERROR;
					}

					if (isAssignTarget && string_slice22(name, 0, i).indexOf(string_get5(name, i)) !== -1) {
						this._log.semanticErrorBadSwizzleAssignment(range.slice(i, i + 1), string_get5(name, i));
						return Type.ERROR;
					}
				}

				return type(type.componentType(), count);
			}
		}

		this._log.semanticErrorBadSwizzle(range, type, name);
		return Type.ERROR;
	}

	_resolveAsExpression(node: Node): void {
		this.resolveNode(node);

		if (node.kind === NodeKind.TYPE && node.resolvedType !== Type.ERROR) {
			this._log.semanticErrorUnexpectedType(node.range, node.resolvedType);
			node.resolvedType = Type.ERROR;
		}
	}

	_resolveChildren(node: Node): void {
		for (let child = node.firstChild(); child !== null; child = child.nextSibling()) {
			this.resolveNode(child);
		}
	}

	_checkStorage(node: Node): void {
		let n = node;
		assert(NodeKind_isExpression(node.kind));

		label:;
		while (true) {
			if (n.resolvedType === Type.ERROR) {
				break;
			}

			switch (n.kind) {
				case NodeKind.NAME: {
					if (n.symbol.isConst() || n.symbol.isUniform()) {
						this._log.semanticErrorBadStorage(node.range);
					}

					break label;
				}

				case NodeKind.DOT: {
					n = n.dotTarget();
					break;
				}

				case NodeKind.INDEX: {
					n = n.binaryLeft();
					break;
				}

				default: {
					this._log.semanticErrorBadStorage(node.range);
					break label;
				}
			}
		}
	}

	checkConversion(node: Node, type: Type): void {
		if (node.resolvedType !== type && node.resolvedType !== Type.ERROR && type !== Type.ERROR) {
			this._log.semanticErrorBadConversion(node.range, node.resolvedType, type);
		}
	}

	constructor(_log: Log, _data: CompilerData) {
		this._log = _log;
		this._data = _data;
		this._controlFlow = new ControlFlowAnalyzer();
		this._versions = [];
		this._generatedExtensions = new Map();
		this._returnType = null;
	}
}
