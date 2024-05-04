import { Node, NodeKind } from './node.js';
import * as swizzle from './swizzle.js';
import { VariableKind } from './symbol.js';
import { Type } from './type.js';

const __RELEASE__ = false;

export function fold(node: Node): Node {
	if (__RELEASE__) {
		return _fold(node);
	}

	// Run sanity checks in debug mode
	else {
		const folded = _fold(node);

		if (folded) {
			console.assert(!folded.parent());

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
			console.assert(node.resolvedType === Type.INT && !node.hasChildren());
			break;
		}

		case NodeKind.BOOL: {
			console.assert(node.resolvedType === Type.BOOL && !node.hasChildren());
			break;
		}

		case NodeKind.FLOAT: {
			console.assert(node.resolvedType === Type.FLOAT && !node.hasChildren());
			break;
		}

		case NodeKind.CALL: {
			const target = node.callTarget();
			console.assert(target.kind === NodeKind.TYPE);
			console.assert(target.resolvedType === node.resolvedType);
			const componentType = target.resolvedType.componentType();
			const componentCount = target.resolvedType.componentCount();

			// Native component types
			if (componentType) {
				console.assert(node.childCount() === 1 + componentCount);
				console.assert(target.resolvedType !== Type.INT && target.resolvedType !== Type.BOOL && target.resolvedType !== Type.FLOAT);

				for (let child = target.nextSibling(); child; child = child.nextSibling()) {
					console.assert(child.resolvedType === componentType);
					console.assert(child.kind !== NodeKind.CALL);
					_check(child);
				}
			}

			// User-defined structs
			else {
				const struct = target.resolvedType.symbol.asStruct();
				let i = 0;
				console.assert(node.childCount() === 1 + struct.variables.length);

				for (let child1 = target.nextSibling(); child1; child1 = child1.nextSibling()) {
					console.assert(child1.resolvedType === struct.variables[i].type.resolvedType);
					_check(child1);
					i++;
				}
			}
			break;
		}

		default: {
			console.assert(false);
			break;
		}
	}
}

export function _fold(node: Node): Node {
	console.assert(node.resolvedType);

	if (node.resolvedType === Type.ERROR) {
		return;
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

	return;
}

export function _foldName(node: Node): Node {
	const symbol = node.symbol;

	if (symbol && symbol.isConst()) {
		if (symbol.constantValue) {
			return symbol.constantValue.clone();
		}

		if (symbol.asVariable().kind !== VariableKind.ARGUMENT) {
			return Node.createUnknownConstant(node.resolvedType);
		}
	}

	return;
}

export function _foldSequence(node: Node): Node {
	for (let child = node.firstChild(); child; child = child.nextSibling()) {
		const folded = fold(child);

		if (!folded || child === node.lastChild()) {
			return folded;
		}
	}

	return;
}

export function _foldHook(node: Node): Node {
	const foldedTest = fold(node.hookTest());
	const foldedTrue = fold(node.hookTrue());
	const foldedFalse = fold(node.hookFalse());

	if (foldedTest && foldedTest.kind === NodeKind.BOOL && foldedTrue && foldedFalse) {
		return foldedTest.asBool() ? foldedTrue : foldedFalse;
	}

	return;
}

export function _foldDot(node: Node): Node {
	const folded = fold(node.dotTarget());

	if (folded && folded.kind === NodeKind.CALL) {
		const resolvedType = folded.resolvedType;
		const name = node.asString();

		// Evaluate a swizzle
		if (resolvedType.isVector()) {
			const componentCount = resolvedType.componentCount();

			// Find the swizzle set
			for (const set of swizzle.strings(componentCount)) {
				if (set.indexOf(name[0]) !== -1) {
					if (name.length === 1) {
						return folded.childAt(1 + set.indexOf(name)).remove();
					}

					const swizzleType = swizzle.type(resolvedType.componentType(), name.length);
					const result = Node.createConstructorCall(swizzleType);

					for (let i = 0; i < name.length; i++) {
						result.appendChild(folded.childAt(1 + set.indexOf(name[i]))).clone();
					}

					return result;
				}
			}
		}

		// Evaluate a struct field
		else if (resolvedType.symbol && resolvedType.symbol.isStruct()) {
			const symbol = resolvedType.symbol.asStruct();
			const variables = symbol.variables;
			console.assert(folded.childCount() === 1 + variables.length);

			// Extract the field from the constructor call
			for (let i1 = 0, count2 = variables.length; i1 < count2; i1 = i1 + 1) {
				const variable = variables[i1];

				if (variable.name === name) {
					return folded.childAt(1 + i1).remove();
				}
			}
		}
	}

	return;
}

export function _foldIndex(node: Node): Node {
	const foldedLeft = fold(node.binaryLeft());
	const foldedRight = fold(node.binaryRight());

	// Both children must also be constants
	if (foldedLeft && foldedLeft.kind === NodeKind.CALL && foldedRight && foldedRight.kind === NodeKind.INT) {
		const type = foldedLeft.resolvedType;

		if (type.isVector()) {
			const indexCount = type.indexCount();
			const index = foldedRight.asInt();

			// The index must be in range
			if (0 <= index && index < indexCount) {
				return foldedLeft.childAt(index + 1).remove();
			}
		}

		// Indexing into a matrix creates a vector
		else if (type.isMatrix()) {
			const indexCount1 = type.indexCount();
			const index1 = foldedRight.asInt();
			console.assert(foldedLeft.childCount() === 1 + indexCount1 * indexCount1);

			// The index must be in range
			if (0 <= index1 && index1 < indexCount1) {
				const indexType = type.indexType();
				const result = Node.createConstructorCall(indexType);
				const before = foldedLeft.childAt(index1 * indexCount1);

				for (let i = 0, count = indexCount1; i < count; i++) {
					result.appendChild(before.nextSibling().remove());
				}

				return result;
			}
		}
	}

	return;
}

export function _foldCall(node: Node): Node {
	const target = node.callTarget();

	// Only constructor calls are considered constants
	if (target.kind !== NodeKind.TYPE) {
		return;
	}

	const type = target.resolvedType;
	const componentType = type.componentType();
	let matrixStride = 0;
	const _arguments: Node[] = [];
	let count = 0;

	// Make sure all arguments are constants
	for (let child = target.nextSibling(); child; child = child.nextSibling()) {
		let folded = fold(child);

		if (!folded) {
			return;
		}

		// Expand values inline from constructed native types
		if (folded.kind === NodeKind.CALL && componentType && folded.callTarget().resolvedType.componentType()) {
			for (let value = folded.callTarget().nextSibling(); value; value = value.nextSibling()) {
				const casted = _castValue(componentType, value);

				if (!casted) {
					return;
				}

				_arguments.push(casted);
			}
		}

		// Auto-cast values for primitive types
		else {
			if (componentType) {
				folded = _castValue(componentType, folded);

				if (!folded) {
					return;
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
		return;
	}

	// Native component-based types
	if (type.componentType()) {
		return _foldComponentConstructor(_arguments, type, type.isMatrix() ? matrixStride : 0);
	}

	// User-defined struct types
	if (type.symbol && type.symbol.isStruct()) {
		return _foldStruct(_arguments, type);
	}
}

export function _floatValues(node: Node): number[] {
	const values: number[] = [];

	for (let child = node.callTarget().nextSibling(); child; child = child.nextSibling()) {
		values.push(child.asFloat());
	}

	return values;
}

export function _foldMultiply(node: Node): Node {
	const left = fold(node.binaryLeft());
	const right = fold(node.binaryRight());
	const leftType: Type = left?.resolvedType;
	const rightType: Type = right?.resolvedType;

	if (left && right) {
		// Vector-matrix multiply
		if ((leftType === Type.VEC2 && rightType === Type.MAT2) || (leftType === Type.VEC3 && rightType === Type.MAT3) || (leftType === Type.VEC4 && rightType === Type.MAT4)) {
			const stride = leftType.indexCount();
			const result = Node.createConstructorCall(leftType);
			const leftValues = _floatValues(left);
			const rightValues = _floatValues(right);

			for (let i = 0, count1 = stride; i < count1; i++) {
				let total = 0;

				for (let col = 0, count = stride; col < count; col = col + 1) {
					total += leftValues[col] * rightValues[col + i * stride];
				}

				result.appendChild(Node.createFloat(total));
			}

			return result;
		}

		// Matrix-vector multiply
		if ((leftType === Type.MAT2 && rightType === Type.VEC2) || (leftType === Type.MAT3 && rightType === Type.VEC3) || (leftType === Type.MAT4 && rightType === Type.VEC4)) {
			const stride1 = leftType.indexCount();
			const result1 = Node.createConstructorCall(rightType);
			const leftValues1 = _floatValues(left);
			const rightValues1 = _floatValues(right);

			for (let i1 = 0, count3 = stride1; i1 < count3; i1 = i1 + 1) {
				let total1 = 0;

				for (let row = 0, count2 = stride1; row < count2; row = row + 1) {
					total1 += leftValues1[i1 + row * stride1] * rightValues1[row];
				}

				result1.appendChild(Node.createFloat(total1));
			}

			return result1;
		}

		// Matrix-matrix multiply
		if (leftType.isMatrix() && rightType === leftType) {
			const stride2 = leftType.indexCount();
			const result2 = Node.createConstructorCall(leftType);
			const leftValues2 = _floatValues(left);
			const rightValues2 = _floatValues(right);

			for (let row1 = 0, count6 = stride2; row1 < count6; row1 = row1 + 1) {
				for (let col1 = 0, count5 = stride2; col1 < count5; col1 = col1 + 1) {
					let total2 = 0;

					for (let i2 = 0, count4 = stride2; i2 < count4; i2 = i2 + 1) {
						total2 += leftValues2[col1 + i2 * stride2] * rightValues2[i2 + row1 * stride2];
					}

					result2.appendChild(Node.createFloat(total2));
				}
			}

			return result2;
		}

		return _foldFloat2(left, right, (a: number, b: number) => a * b) ?? _foldInt2(left, right, (a: number, b: number) => a * b);
	}
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

		default:
			return;
	}

	const value1 = type;

	if (value1 === Type.BOOL) {
		return Node.createBool(!!value);
	} else if (value1 === Type.INT) {
		return Node.createInt(value | 0);
	} else if (value1 === Type.FLOAT) {
		return Node.createFloat(value);
	}
}

export function _foldComponentConstructor(_arguments: Node[], type: Type, matrixStride: number): Node {
	const componentCount = type.componentCount();
	const componentType = type.componentType();
	const node = Node.createConstructorCall(type);
	console.assert(componentCount > 0);

	// Passing a single component as an argument always works
	if (_arguments.length === 1) {
		const argument = _arguments[0];

		if (argument.resolvedType !== componentType) {
			return;
		}

		// When doing this with a matrix, only the diagonal is filled
		const isMatrix = type.isMatrix();
		const stride = type.indexCount();

		// Fill the target by repeating the single component
		for (let i = 0, count = componentCount; i < count; i++) {
			const isOffMatrixDiagonal = isMatrix && i % (stride + 1) !== 0;
			node.appendChild(isOffMatrixDiagonal ? Node.createFloat(0) : argument.clone());
		}
	}

	// If a matrix is constructed from a matrix, then each component (column i,
	// row j) in the result that has a corresponding component (column i, row j)
	// in the argument will be initialized from there. All other components will
	// be initialized to the identity matrix.
	else if (matrixStride !== 0) {
		const stride1 = type.indexCount();
		console.assert(type.isMatrix());
		console.assert(stride1 * stride1 === componentCount);

		for (let row = 0, count2 = stride1; row < count2; row = row + 1) {
			for (let col = 0, count1 = stride1; col < count1; col = col + 1) {
				node.appendChild(col < matrixStride && row < matrixStride ? _arguments[col + row * matrixStride] : Node.createFloat(col === row ? 1 : 0));
			}
		}
	}

	// Multiple arguments are more involved
	else {
		// Extra arguments are ignored
		if (_arguments.length < componentCount) {
			return;
		}

		// The constructed value is represented as a constructor call
		for (let i1 = 0, count3 = componentCount; i1 < count3; i1 = i1 + 1) {
			const argument1 = _arguments[i1];

			// All casts should be resolved by this point
			if (argument1.resolvedType !== componentType) {
				return;
			}

			node.appendChild(argument1);
		}
	}

	// Don't wrap primitive types
	if (!type.indexType()) {
		return node.lastChild().remove();
	}

	return node;
}

export function _foldStruct(_arguments: Node[], type: Type): Node {
	const variables = type.symbol.asStruct().variables;
	const node = Node.createConstructorCall(type);

	// Structs can only be constructed with the exact number of arguments
	if (_arguments.length !== variables.length) {
		return;
	}

	// The constructed value is represented as a constructor call
	for (let i = 0, count = _arguments.length; i < count; i++) {
		if (_arguments[i].resolvedType !== variables[i].type.resolvedType) {
			return;
		}

		node.appendChild(_arguments[i]);
	}

	return node;
}

export function _foldBinaryEquality(node: Node): Node {
	const left = fold(node.binaryLeft());
	const right = fold(node.binaryRight());

	if (left && right) {
		const value = left.looksTheSameAs(right);
		return Node.createBool(node.kind === NodeKind.EQUAL ? value : !value);
	}
}

export function _foldComponentwiseUnary(node: Node, componentType: Type, argumentKind: NodeKind, op: (v0: Node) => Node): Node {
	if (node.kind === NodeKind.CALL && node.callTarget().kind === NodeKind.TYPE && node.callTarget().resolvedType.componentType() === componentType) {
		const result = Node.createConstructorCall(node.callTarget().resolvedType);

		for (let child = node.callTarget().nextSibling(); child; child = child.nextSibling()) {
			const folded = fold(child);

			if (!folded || folded.kind !== argumentKind) {
				return;
			}

			result.appendChild(op(folded));
		}

		return result;
	}
}

export function _foldFloat1(node: Node, op: (v0: number) => number): Node {
	if (node.kind === NodeKind.FLOAT) {
		return Node.createFloat(op(node.asFloat()));
	}

	return _foldComponentwiseUnary(node, Type.FLOAT, NodeKind.FLOAT, (x: Node) => Node.createFloat(op(x.asFloat())));
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
	const leftHasComponents = left.kind === NodeKind.CALL && left.callTarget().kind === NodeKind.TYPE && left.callTarget().resolvedType.componentType() === componentType;
	const rightHasComponents = right.kind === NodeKind.CALL && right.callTarget().kind === NodeKind.TYPE && right.callTarget().resolvedType.componentType() === componentType;

	// Vector-vector binary operator
	if (leftHasComponents && rightHasComponents && right.resolvedType === left.resolvedType) {
		const result = Node.createConstructorCall(left.resolvedType);
		let leftChild = left.callTarget().nextSibling();
		let rightChild = right.callTarget().nextSibling();

		while (leftChild && rightChild) {
			const foldedLeft = fold(leftChild);
			const foldedRight = fold(rightChild);

			if (!foldedLeft || foldedLeft.kind !== argumentKind || !foldedRight || foldedRight.kind !== argumentKind) {
				return;
			}

			result.appendChild(op(foldedLeft, foldedRight));
			leftChild = leftChild.nextSibling();
			rightChild = rightChild.nextSibling();
		}

		if (!leftChild && !rightChild) {
			return result;
		}
	}

	// Vector-scalar binary operator
	else if (leftHasComponents && right.kind === argumentKind) {
		const result1 = Node.createConstructorCall(left.resolvedType);

		for (let child = left.callTarget().nextSibling(); child; child = child.nextSibling()) {
			const folded = fold(child);

			if (!folded || folded.kind !== argumentKind) {
				return;
			}

			result1.appendChild(op(folded, right));
		}

		return result1;
	}

	// Scalar-vector binary operator
	else if (left.kind === argumentKind && rightHasComponents) {
		const result = Node.createConstructorCall(right.resolvedType);

		for (let child = right.callTarget().nextSibling(); child; child = child.nextSibling()) {
			const folded = fold(child);

			if (!folded || folded.kind !== argumentKind) {
				return;
			}

			result.appendChild(op(left, folded));
		}

		return result;
	}
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

export function _foldUnaryBool(node: Node, op: (v0: boolean) => boolean): Node {
	const value = fold(node.unaryValue());

	if (value && value.kind === NodeKind.BOOL) {
		return Node.createBool(op(value.asBool()));
	}
}

export function _foldUnaryFloatOrInt(node: Node, floatOp: (v0: number) => number, intOp: (v0: number) => number): Node {
	const value = fold(node.unaryValue());

	if (value) {
		return _foldFloat1(value, floatOp) ?? _foldInt1(value, intOp);
	}
}

/////////////////////////////////////////////////////////////////////////////////

export function _foldBinaryBool(node: Node, op: (v0: boolean, v1: boolean) => boolean): Node {
	const left = fold(node.binaryLeft());
	const right = fold(node.binaryRight());

	if (left && right && left.kind === NodeKind.BOOL && right.kind === NodeKind.BOOL) {
		return Node.createBool(op(left.asBool(), right.asBool()));
	}
}

export function _foldBinaryFloatOrInt(node: Node, floatOp: (v0: number, v1: number) => number, intOp: (v0: number, v1: number) => number): Node {
	const left = fold(node.binaryLeft());
	const right = fold(node.binaryRight());

	if (left && right) {
		return _foldFloat2(left, right, floatOp) ?? _foldInt2(left, right, intOp);
	}
}

export function _foldBinaryFloatOrIntToBool(node: Node, op: (v0: number, v1: number) => boolean): Node {
	const left = fold(node.binaryLeft());
	const right = fold(node.binaryRight());

	// The comparison operators only work on scalars in GLSL. To do comparisons
	// on vectors, the functions greaterThan(), lessThan(), greaterThanEqual(),
	// and lessThanEqual() must be used.
	if (left && right) {
		if (left.kind === NodeKind.FLOAT && right.kind === NodeKind.FLOAT) {
			return Node.createBool(op(left.asFloat(), right.asFloat()));
		}

		if (left.kind === NodeKind.INT && right.kind === NodeKind.INT) {
			return Node.createBool(op(left.asInt(), right.asInt()));
		}
	}
}
