import { assert, List_get2, string_get5, List_first } from '../native-js.js';
import { RELEASE } from '../native.js';

import { Node, NodeKind } from './node.js';
import { strings, type } from './swizzle.js';
import { VariableKind } from './symbol.js';
import { Type } from './type.js';

export function fold(node: Node): Node {
	if (RELEASE) {
		return _fold(node);
	}

	// Run sanity checks in debug mode
	else {
		let folded = _fold(node);

		if (folded !== null) {
			assert(folded.parent() === null);

			if (folded.kind !== NodeKind.UNKNOWN_CONSTANT) {
				_check(folded);
			}
		}

		return folded;
	}
}

export function _check(node: Node): void {
	switch (node.kind) {
		case NodeKind.INT: {
			assert(node.resolvedType === Type.INT && !node.hasChildren());
			break;
		}

		case NodeKind.BOOL: {
			assert(node.resolvedType === Type.BOOL && !node.hasChildren());
			break;
		}

		case NodeKind.FLOAT: {
			assert(node.resolvedType === Type.FLOAT && !node.hasChildren());
			break;
		}

		case NodeKind.CALL: {
			let target = node.callTarget();
			assert(target.kind === NodeKind.TYPE);
			assert(target.resolvedType === node.resolvedType);
			let componentType = target.resolvedType.componentType();
			let componentCount = target.resolvedType.componentCount();

			// Native component types
			if (componentType !== null) {
				assert(node.childCount() === 1 + componentCount);
				assert(target.resolvedType !== Type.INT && target.resolvedType !== Type.BOOL && target.resolvedType !== Type.FLOAT);

				for (let child = target.nextSibling(); child !== null; child = child.nextSibling()) {
					assert(child.resolvedType === componentType);
					assert(child.kind !== NodeKind.CALL);
					_check(child);
				}
			}

			// User-defined structs
			else {
				let struct = target.resolvedType.symbol.asStruct();
				let i = 0;
				assert(node.childCount() === 1 + struct.variables.length);

				for (let child1 = target.nextSibling(); child1 !== null; child1 = child1.nextSibling()) {
					assert(child1.resolvedType === List_get2(struct.variables, i).type.resolvedType);
					_check(child1);
					i = i + 1;
				}
			}
			break;
		}

		default: {
			assert(false);
			break;
		}
	}
}

export function _fold(node: Node): Node {
	assert(node.resolvedType !== null);

	if (node.resolvedType === Type.ERROR) {
		return null;
	}

	switch (node.kind) {
		case NodeKind.INT:
		case NodeKind.FLOAT:
		case NodeKind.BOOL: {
			return node.clone();
		}

		case NodeKind.NAME: {
			return _foldName(node);
		}

		case NodeKind.SEQUENCE: {
			return _foldSequence(node);
		}

		case NodeKind.HOOK: {
			return _foldHook(node);
		}

		case NodeKind.DOT: {
			return _foldDot(node);
		}

		case NodeKind.INDEX: {
			return _foldIndex(node);
		}

		case NodeKind.CALL: {
			return _foldCall(node);
		}

		case NodeKind.NEGATIVE: {
			return _foldUnaryFloatOrInt(
				node,
				(x: number) => {
					return -x;
				},
				(x: number) => {
					return -x;
				}
			);
		}

		case NodeKind.NOT: {
			return _foldUnaryBool(node, (x: boolean) => {
				return !x;
			});
		}

		case NodeKind.POSITIVE: {
			return _foldUnaryFloatOrInt(
				node,
				(x: number) => {
					return +x;
				},
				(x: number) => {
					return +x;
				}
			);
		}

		case NodeKind.ADD: {
			return _foldBinaryFloatOrInt(
				node,
				(a: number, b: number) => {
					return a + b;
				},
				(a: number, b: number) => {
					return a + b;
				}
			);
		}

		case NodeKind.SUBTRACT: {
			return _foldBinaryFloatOrInt(
				node,
				(a: number, b: number) => {
					return a - b;
				},
				(a: number, b: number) => {
					return a - b;
				}
			);
		}

		case NodeKind.MULTIPLY: {
			return _foldMultiply(node);
		}

		// Dividing by zero is undefined
		case NodeKind.DIVIDE: {
			return _foldBinaryFloatOrInt(
				node,
				(a: number, b: number) => {
					return b !== 0 ? a / b : 0;
				},
				(a: number, b: number) => {
					return b !== 0 ? (a / b) | 0 : 0;
				}
			);
		}

		case NodeKind.EQUAL:
		case NodeKind.NOT_EQUAL: {
			return _foldBinaryEquality(node);
		}

		case NodeKind.LOGICAL_AND: {
			return _foldBinaryBool(node, (a: boolean, b: boolean) => {
				return a && b;
			});
		}

		case NodeKind.LOGICAL_OR: {
			return _foldBinaryBool(node, (a: boolean, b: boolean) => {
				return a || b;
			});
		}

		case NodeKind.LOGICAL_XOR: {
			return _foldBinaryBool(node, (a: boolean, b: boolean) => {
				return a !== b;
			});
		}

		case NodeKind.GREATER_THAN: {
			return _foldBinaryFloatOrIntToBool(node, (a: number, b: number) => {
				return a > b;
			});
		}

		case NodeKind.GREATER_THAN_OR_EQUAL: {
			return _foldBinaryFloatOrIntToBool(node, (a: number, b: number) => {
				return a >= b;
			});
		}

		case NodeKind.LESS_THAN: {
			return _foldBinaryFloatOrIntToBool(node, (a: number, b: number) => {
				return a < b;
			});
		}

		case NodeKind.LESS_THAN_OR_EQUAL: {
			return _foldBinaryFloatOrIntToBool(node, (a: number, b: number) => {
				return a <= b;
			});
		}
	}

	return null;
}

export function _foldName(node: Node): Node {
	let symbol = node.symbol;

	if (symbol !== null && symbol.isConst()) {
		if (symbol.constantValue !== null) {
			return symbol.constantValue.clone();
		}

		if (symbol.asVariable().kind !== VariableKind.ARGUMENT) {
			return Node.createUnknownConstant(node.resolvedType);
		}
	}

	return null;
}

export function _foldSequence(node: Node): Node {
	for (let child = node.firstChild(); child !== null; child = child.nextSibling()) {
		let folded = fold(child);

		if (folded === null || child === node.lastChild()) {
			return folded;
		}
	}

	return null;
}

export function _foldHook(node: Node): Node {
	let foldedTest = fold(node.hookTest());
	let foldedTrue = fold(node.hookTrue());
	let foldedFalse = fold(node.hookFalse());

	if (foldedTest !== null && foldedTest.kind === NodeKind.BOOL && foldedTrue !== null && foldedFalse !== null) {
		return foldedTest.asBool() ? foldedTrue : foldedFalse;
	}

	return null;
}

export function _foldDot(node: Node): Node {
	let folded = fold(node.dotTarget());

	if (folded !== null && folded.kind === NodeKind.CALL) {
		let resolvedType = folded.resolvedType;
		let name = node.asString();

		// Evaluate a swizzle
		if (resolvedType.isVector()) {
			let count = name.length;
			let componentCount = resolvedType.componentCount();

			// Find the swizzle set
			for (const set of strings(componentCount)) {
				if (set.indexOf(string_get5(name, 0)) !== -1) {
					if (count === 1) {
						return folded.childAt(1 + set.indexOf(name)).remove();
					}

					let swizzleType = type(resolvedType.componentType(), count);
					let result = Node.createConstructorCall(swizzleType);

					for (let i = 0, count1 = count; i < count1; i = i + 1) {
						result.appendChild(folded.childAt(1 + set.indexOf(string_get5(name, i))).clone());
					}

					return result;
				}
			}
		}

		// Evaluate a struct field
		else if (resolvedType.symbol !== null && resolvedType.symbol.isStruct()) {
			let symbol = resolvedType.symbol.asStruct();
			let variables = symbol.variables;
			assert(folded.childCount() === 1 + variables.length);

			// Extract the field from the constructor call
			for (let i1 = 0, count2 = variables.length; i1 < count2; i1 = i1 + 1) {
				let variable = List_get2(variables, i1);

				if (variable.name === name) {
					return folded.childAt(1 + i1).remove();
				}
			}
		}
	}

	return null;
}

export function _foldIndex(node: Node): Node {
	let foldedLeft = fold(node.binaryLeft());
	let foldedRight = fold(node.binaryRight());

	// Both children must also be constants
	if (foldedLeft !== null && foldedLeft.kind === NodeKind.CALL && foldedRight !== null && foldedRight.kind === NodeKind.INT) {
		let type = foldedLeft.resolvedType;

		if (type.isVector()) {
			let indexCount = type.indexCount();
			let index = foldedRight.asInt();

			// The index must be in range
			if (0 <= index && index < indexCount) {
				return foldedLeft.childAt(index + 1).remove();
			}
		}

		// Indexing into a matrix creates a vector
		else if (type.isMatrix()) {
			let indexCount1 = type.indexCount();
			let index1 = foldedRight.asInt();
			assert(foldedLeft.childCount() === 1 + indexCount1 * indexCount1);

			// The index must be in range
			if (0 <= index1 && index1 < indexCount1) {
				let indexType = type.indexType();
				let result = Node.createConstructorCall(indexType);
				let before = foldedLeft.childAt(index1 * indexCount1);

				for (let i = 0, count = indexCount1; i < count; i = i + 1) {
					result.appendChild(before.nextSibling().remove());
				}

				return result;
			}
		}
	}

	return null;
}

export function _foldCall(node: Node): Node {
	let target = node.callTarget();

	// Only constructor calls are considered constants
	if (target.kind !== NodeKind.TYPE) {
		return null;
	}

	let type = target.resolvedType;
	let componentType = type.componentType();
	let matrixStride = 0;
	let _arguments: Array<Node> = [];
	let count = 0;

	// Make sure all arguments are constants
	for (let child = target.nextSibling(); child !== null; child = child.nextSibling()) {
		let folded = fold(child);

		if (folded === null) {
			return null;
		}

		// Expand values inline from constructed native types
		if (folded.kind === NodeKind.CALL && componentType !== null && folded.callTarget().resolvedType.componentType() !== null) {
			for (let value = folded.callTarget().nextSibling(); value !== null; value = value.nextSibling()) {
				let casted = _castValue(componentType, value);

				if (casted === null) {
					return null;
				}

				_arguments.push(casted);
			}
		}

		// Auto-cast values for primitive types
		else {
			if (componentType !== null) {
				folded = _castValue(componentType, folded);

				if (folded === null) {
					return null;
				}
			}

			_arguments.push(folded);
		}

		if (folded.resolvedType.isMatrix()) {
			matrixStride = folded.resolvedType.indexCount();
		}

		count = count + 1;
	}

	// If a matrix argument is given to a matrix constructor, it is an error
	// to have any other arguments
	if (type.isMatrix() && matrixStride !== 0 && count !== 1) {
		return null;
	}

	// Native component-based types
	if (type.componentType() !== null) {
		return _foldComponentConstructor(_arguments, type, type.isMatrix() ? matrixStride : 0);
	}

	// User-defined struct types
	if (type.symbol !== null && type.symbol.isStruct()) {
		return _foldStruct(_arguments, type);
	}

	return null;
}

export function _floatValues(node: Node): Array<number> {
	let values: Array<number> = [];

	for (let child = node.callTarget().nextSibling(); child !== null; child = child.nextSibling()) {
		values.push(child.asFloat());
	}

	return values;
}

export function _foldMultiply(node: Node): Node {
	let ref: Node;
	let left = fold(node.binaryLeft());
	let right = fold(node.binaryRight());
	let leftType: Type = left !== null ? left.resolvedType : null;
	let rightType: Type = right !== null ? right.resolvedType : null;

	if (left !== null && right !== null) {
		// Vector-matrix multiply
		if ((leftType === Type.VEC2 && rightType === Type.MAT2) || (leftType === Type.VEC3 && rightType === Type.MAT3) || (leftType === Type.VEC4 && rightType === Type.MAT4)) {
			let stride = leftType.indexCount();
			let result = Node.createConstructorCall(leftType);
			let leftValues = _floatValues(left);
			let rightValues = _floatValues(right);

			for (let i = 0, count1 = stride; i < count1; i = i + 1) {
				let total = 0;

				for (let col = 0, count = stride; col < count; col = col + 1) {
					total += List_get2(leftValues, col) * List_get2(rightValues, col + i * stride);
				}

				result.appendChild(Node.createFloat(total));
			}

			return result;
		}

		// Matrix-vector multiply
		if ((leftType === Type.MAT2 && rightType === Type.VEC2) || (leftType === Type.MAT3 && rightType === Type.VEC3) || (leftType === Type.MAT4 && rightType === Type.VEC4)) {
			let stride1 = leftType.indexCount();
			let result1 = Node.createConstructorCall(rightType);
			let leftValues1 = _floatValues(left);
			let rightValues1 = _floatValues(right);

			for (let i1 = 0, count3 = stride1; i1 < count3; i1 = i1 + 1) {
				let total1 = 0;

				for (let row = 0, count2 = stride1; row < count2; row = row + 1) {
					total1 += List_get2(leftValues1, i1 + row * stride1) * List_get2(rightValues1, row);
				}

				result1.appendChild(Node.createFloat(total1));
			}

			return result1;
		}

		// Matrix-matrix multiply
		if (leftType.isMatrix() && rightType === leftType) {
			let stride2 = leftType.indexCount();
			let result2 = Node.createConstructorCall(leftType);
			let leftValues2 = _floatValues(left);
			let rightValues2 = _floatValues(right);

			for (let row1 = 0, count6 = stride2; row1 < count6; row1 = row1 + 1) {
				for (let col1 = 0, count5 = stride2; col1 < count5; col1 = col1 + 1) {
					let total2 = 0;

					for (let i2 = 0, count4 = stride2; i2 < count4; i2 = i2 + 1) {
						total2 += List_get2(leftValues2, col1 + i2 * stride2) * List_get2(rightValues2, i2 + row1 * stride2);
					}

					result2.appendChild(Node.createFloat(total2));
				}
			}

			return result2;
		}

		return (ref = _foldFloat2(left, right, (a: number, b: number) => {
			return a * b;
		})) !== null
			? ref
			: _foldInt2(left, right, (a: number, b: number) => {
					return a * b;
				});
	}

	return null;
}

export function _castValue(type: Type, node: Node): Node {
	let value = 0;

	switch (node.kind) {
		case NodeKind.BOOL: {
			value = node.asBool() ? 1 : 0;
			break;
		}

		case NodeKind.INT: {
			value = node.asInt();
			break;
		}

		case NodeKind.FLOAT: {
			value = node.asFloat();
			break;
		}

		default: {
			return null;
		}
	}

	let value1 = type;

	if (value1 === Type.BOOL) {
		return Node.createBool(!!value);
	} else if (value1 === Type.INT) {
		return Node.createInt(value | 0);
	} else if (value1 === Type.FLOAT) {
		return Node.createFloat(value);
	}

	return null;
}

export function _foldComponentConstructor(_arguments: Array<Node>, type: Type, matrixStride: number): Node {
	let componentCount = type.componentCount();
	let componentType = type.componentType();
	let node = Node.createConstructorCall(type);
	assert(componentCount > 0);

	// Passing a single component as an argument always works
	if (_arguments.length === 1) {
		let argument = List_first(_arguments);

		if (argument.resolvedType !== componentType) {
			return null;
		}

		// When doing this with a matrix, only the diagonal is filled
		let isMatrix = type.isMatrix();
		let stride = type.indexCount();

		// Fill the target by repeating the single component
		for (let i = 0, count = componentCount; i < count; i = i + 1) {
			let isOffMatrixDiagonal = isMatrix && i % (stride + 1) !== 0;
			node.appendChild(isOffMatrixDiagonal ? Node.createFloat(0) : argument.clone());
		}
	}

	// If a matrix is constructed from a matrix, then each component (column i,
	// row j) in the result that has a corresponding component (column i, row j)
	// in the argument will be initialized from there. All other components will
	// be initialized to the identity matrix.
	else if (matrixStride !== 0) {
		let stride1 = type.indexCount();
		assert(type.isMatrix());
		assert(stride1 * stride1 === componentCount);

		for (let row = 0, count2 = stride1; row < count2; row = row + 1) {
			for (let col = 0, count1 = stride1; col < count1; col = col + 1) {
				node.appendChild(col < matrixStride && row < matrixStride ? List_get2(_arguments, col + row * matrixStride) : Node.createFloat(col === row ? 1 : 0));
			}
		}
	}

	// Multiple arguments are more involved
	else {
		// Extra arguments are ignored
		if (_arguments.length < componentCount) {
			return null;
		}

		// The constructed value is represented as a constructor call
		for (let i1 = 0, count3 = componentCount; i1 < count3; i1 = i1 + 1) {
			let argument1 = List_get2(_arguments, i1);

			// All casts should be resolved by this point
			if (argument1.resolvedType !== componentType) {
				return null;
			}

			node.appendChild(argument1);
		}
	}

	// Don't wrap primitive types
	if (type.indexType() === null) {
		return node.lastChild().remove();
	}

	return node;
}

export function _foldStruct(_arguments: Array<Node>, type: Type): Node {
	let variables = type.symbol.asStruct().variables;
	let node = Node.createConstructorCall(type);

	// Structs can only be constructed with the exact number of arguments
	if (_arguments.length !== variables.length) {
		return null;
	}

	// The constructed value is represented as a constructor call
	for (let i = 0, count = _arguments.length; i < count; i = i + 1) {
		if (List_get2(_arguments, i).resolvedType !== List_get2(variables, i).type.resolvedType) {
			return null;
		}

		node.appendChild(List_get2(_arguments, i));
	}

	return node;
}

export function _foldBinaryEquality(node: Node): Node {
	let left = fold(node.binaryLeft());
	let right = fold(node.binaryRight());

	if (left !== null && right !== null) {
		let value = left.looksTheSameAs(right);
		return Node.createBool(node.kind === NodeKind.EQUAL ? value : !value);
	}

	return null;
}

/////////////////////////////////////////////////////////////////////////////////

export function _foldComponentwiseUnary(node: Node, componentType: Type, argumentKind: NodeKind, op: (v0: Node) => Node): Node {
	if (node.kind === NodeKind.CALL && node.callTarget().kind === NodeKind.TYPE && node.callTarget().resolvedType.componentType() === componentType) {
		let result = Node.createConstructorCall(node.callTarget().resolvedType);

		for (let child = node.callTarget().nextSibling(); child !== null; child = child.nextSibling()) {
			let folded = fold(child);

			if (folded === null || folded.kind !== argumentKind) {
				return null;
			}

			result.appendChild(op(folded));
		}

		return result;
	}

	return null;
}

export function _foldFloat1(node: Node, op: (v0: number) => number): Node {
	if (node.kind === NodeKind.FLOAT) {
		return Node.createFloat(op(node.asFloat()));
	}

	return _foldComponentwiseUnary(node, Type.FLOAT, NodeKind.FLOAT, (x: Node) => {
		return Node.createFloat(op(x.asFloat()));
	});
}

export function _foldInt1(node: Node, op: (v0: number) => number): Node {
	if (node.kind === NodeKind.INT) {
		return Node.createInt(op(node.asInt()));
	}

	return _foldComponentwiseUnary(node, Type.INT, NodeKind.INT, (x: Node) => {
		return Node.createInt(op(x.asInt()));
	});
}

/////////////////////////////////////////////////////////////////////////////////

export function _foldComponentwiseBinary(left: Node, right: Node, componentType: Type, argumentKind: NodeKind, op: (v0: Node, v1: Node) => Node): Node {
	let leftHasComponents = left.kind === NodeKind.CALL && left.callTarget().kind === NodeKind.TYPE && left.callTarget().resolvedType.componentType() === componentType;
	let rightHasComponents = right.kind === NodeKind.CALL && right.callTarget().kind === NodeKind.TYPE && right.callTarget().resolvedType.componentType() === componentType;

	// Vector-vector binary operator
	if (leftHasComponents && rightHasComponents && right.resolvedType === left.resolvedType) {
		let result = Node.createConstructorCall(left.resolvedType);
		let leftChild = left.callTarget().nextSibling();
		let rightChild = right.callTarget().nextSibling();

		while (leftChild !== null && rightChild !== null) {
			let foldedLeft = fold(leftChild);
			let foldedRight = fold(rightChild);

			if (foldedLeft === null || foldedLeft.kind !== argumentKind || foldedRight === null || foldedRight.kind !== argumentKind) {
				return null;
			}

			result.appendChild(op(foldedLeft, foldedRight));
			leftChild = leftChild.nextSibling();
			rightChild = rightChild.nextSibling();
		}

		if (leftChild === null && rightChild === null) {
			return result;
		}
	}

	// Vector-scalar binary operator
	else if (leftHasComponents && right.kind === argumentKind) {
		let result1 = Node.createConstructorCall(left.resolvedType);

		for (let child = left.callTarget().nextSibling(); child !== null; child = child.nextSibling()) {
			let folded = fold(child);

			if (folded === null || folded.kind !== argumentKind) {
				return null;
			}

			result1.appendChild(op(folded, right));
		}

		return result1;
	}

	// Scalar-vector binary operator
	else if (left.kind === argumentKind && rightHasComponents) {
		let result2 = Node.createConstructorCall(right.resolvedType);

		for (let child1 = right.callTarget().nextSibling(); child1 !== null; child1 = child1.nextSibling()) {
			let folded1 = fold(child1);

			if (folded1 === null || folded1.kind !== argumentKind) {
				return null;
			}

			result2.appendChild(op(left, folded1));
		}

		return result2;
	}

	return null;
}

export function _foldFloat2(left: Node, right: Node, op: (v0: number, v1: number) => number): Node {
	if (left.kind === NodeKind.FLOAT && right.kind === NodeKind.FLOAT) {
		return Node.createFloat(op(left.asFloat(), right.asFloat()));
	}

	return _foldComponentwiseBinary(left, right, Type.FLOAT, NodeKind.FLOAT, (a: Node, b: Node) => {
		return Node.createFloat(op(a.asFloat(), b.asFloat()));
	});
}

export function _foldInt2(left: Node, right: Node, op: (v0: number, v1: number) => number): Node {
	if (left.kind === NodeKind.INT && right.kind === NodeKind.INT) {
		return Node.createInt(op(left.asInt(), right.asInt()));
	}

	return _foldComponentwiseBinary(left, right, Type.INT, NodeKind.INT, (a: Node, b: Node) => {
		return Node.createInt(op(a.asInt(), b.asInt()));
	});
}

/////////////////////////////////////////////////////////////////////////////////

export function _foldUnaryBool(node: Node, op: (v0: boolean) => boolean): Node {
	let value = fold(node.unaryValue());

	if (value !== null && value.kind === NodeKind.BOOL) {
		return Node.createBool(op(value.asBool()));
	}

	return null;
}

export function _foldUnaryFloatOrInt(node: Node, floatOp: (v0: number) => number, intOp: (v0: number) => number): Node {
	let ref: Node;
	let value = fold(node.unaryValue());

	if (value !== null) {
		return (ref = _foldFloat1(value, floatOp)) !== null ? ref : _foldInt1(value, intOp);
	}

	return null;
}

/////////////////////////////////////////////////////////////////////////////////

export function _foldBinaryBool(node: Node, op: (v0: boolean, v1: boolean) => boolean): Node {
	let left = fold(node.binaryLeft());
	let right = fold(node.binaryRight());

	if (left !== null && right !== null && left.kind === NodeKind.BOOL && right.kind === NodeKind.BOOL) {
		return Node.createBool(op(left.asBool(), right.asBool()));
	}

	return null;
}

export function _foldBinaryFloatOrInt(node: Node, floatOp: (v0: number, v1: number) => number, intOp: (v0: number, v1: number) => number): Node {
	let ref: Node;
	let left = fold(node.binaryLeft());
	let right = fold(node.binaryRight());

	if (left !== null && right !== null) {
		return (ref = _foldFloat2(left, right, floatOp)) !== null ? ref : _foldInt2(left, right, intOp);
	}

	return null;
}

export function _foldBinaryFloatOrIntToBool(node: Node, op: (v0: number, v1: number) => boolean): Node {
	let left = fold(node.binaryLeft());
	let right = fold(node.binaryRight());

	// The comparison operators only work on scalars in GLSL. To do comparisons
	// on vectors, the functions greaterThan(), lessThan(), greaterThanEqual(),
	// and lessThanEqual() must be used.
	if (left !== null && right !== null) {
		if (left.kind === NodeKind.FLOAT && right.kind === NodeKind.FLOAT) {
			return Node.createBool(op(left.asFloat(), right.asFloat()));
		}

		if (left.kind === NodeKind.INT && right.kind === NodeKind.INT) {
			return Node.createBool(op(left.asInt(), right.asInt()));
		}
	}

	return null;
}
