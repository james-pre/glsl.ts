// This is from https://www.khronos.org/registry/gles/specs/2.0/GLSL_ES_Specification_1.0.17.pdf
export const API_NAME = '<api>';
export const API = `
import {
	// The variable \`gl_Position\` is available only in the vertex language and is intended for writing the
	// homogeneous vertex position. This value will be used by primitive assembly, clipping, culling, and other
	// fixed functionality operations that operate on primitives after vertex processing has occurred.
	//
	// All executions of a well-formed vertex shader should write a value into this variable. It can be
	// written at any time during shader execution. It may also be read back by the shader after being written.
	// Compilers may generate a diagnostic message if they detect \`gl_Position\` is not written, or read before
	// being written, but not all such cases are detectable. The value of \`gl_Position\` is undefined if a vertex
	// shader is executed and does not write \`gl_Position\`.
	highp vec4 gl_Position;

	// The variable \`gl_PointSize\` is available only in the vertex language and is intended for
	// a vertex shader to write the size of the point to be rasterized. It is measured in pixels.
	mediump float gl_PointSize;

	const int gl_MaxVertexAttribs;
	const int gl_MaxVertexUniformVectors;
	const int gl_MaxVaryingVectors;
	const int gl_MaxVertexTextureImageUnits;
	const int gl_MaxCombinedTextureImageUnits;
	const int gl_MaxTextureImageUnits;
	const int gl_MaxFragmentUniformVectors;
	const int gl_MaxDrawBuffers;

	// The fragment shader has access to the read-only built-in variable \`gl_FrontFacing\` whose value is \`true\` if
	// the fragment belongs to a front-facing primitive. One use of this is to emulate two-sided lighting by
	// selecting one of two colors calculated by the vertex shader.
	const bool gl_FrontFacing;

	// The fragment shader has access to the read-only built-in variable \`gl_PointCoord\`. The values in
	// \`gl_PointCoord\` are two-dimensional coordinates indicating where within a point primitive the current
	// fragment is located. They range from 0.0 to 1.0 across the point. If the current primitive is not a
	// point, then the values read from \`gl_PointCoord\` are undefined.
	const mediump vec2 gl_PointCoord;

	// The variable \`gl_FragCoord\` is available as a read-only variable from within fragment shaders and it holds
	// the window relative coordinates \`x\`, \`y\`, \`z\`, and \`1/w\` values for the fragment. This value is the result
	// of the fixed functionality that interpolates primitives after vertex processing to generate fragments. The \`z\`
	// component is the depth value that will be used for the fragment's depth.
	const mediump vec4 gl_FragCoord;

	// Writing to \`gl_FragColor\` specifies the fragment color that will be used by the subsequent fixed
	// functionality pipeline.
	//
	// If subsequent fixed functionality consumes fragment color and an execution of a fragment shader
	// does not write a value to \`gl_FragColor\` then the fragment color consumed is undefined.
	mediump vec4 gl_FragColor;

	// The variable \`gl_FragData\` is an array. Writing to \`gl_FragData[n]\` specifies the fragment data that will be
	// used by the subsequent fixed functionality pipeline for data \`n\`.
	//
	// If subsequent fixed functionality consumes fragment data and an execution of a fragment shader does not write
	// a value to it, then the fragment data consumed is undefined.
	mediump vec4 gl_FragData[gl_MaxDrawBuffers];

	// Depth range in window coordinates
	struct gl_DepthRangeParameters {
		float near;
		float far;
		// Equal to \`far - near\`
		float diff;
	};

	uniform gl_DepthRangeParameters gl_DepthRange;

	////////////////////////////////////////////////////////////////////////////////
	// Angle and Trigonometry Functions

	// Converts \`degrees\` to radians, i.e. \`π / 180 * degrees\`
	float radians(float degrees);
	// Converts \`degrees\` to radians, i.e. \`π / 180 * degrees\`
	vec2 radians(vec2 degrees);
	// Converts \`degrees\` to radians, i.e. \`π / 180 * degrees\`
	vec3 radians(vec3 degrees);
	// Converts \`degrees\` to radians, i.e. \`π / 180 * degrees\`
	vec4 radians(vec4 degrees);

	// Converts \`radians\` to degrees, i.e. \`180 / π * radians\`
	float degrees(float radians);
	// Converts \`radians\` to degrees, i.e. \`180 / π * radians\`
	vec2 degrees(vec2 radians);
	// Converts \`radians\` to degrees, i.e. \`180 / π * radians\`
	vec3 degrees(vec3 radians);
	// Converts \`radians\` to degrees, i.e. \`180 / π * radians\`
	vec4 degrees(vec4 radians);

	// The standard trigonometric sine function.
	float sin(float angle);
	// The standard trigonometric sine function.
	vec2 sin(vec2 angle);
	// The standard trigonometric sine function.
	vec3 sin(vec3 angle);
	// The standard trigonometric sine function.
	vec4 sin(vec4 angle);

	// The standard trigonometric cosine function.
	float cos(float angle);
	// The standard trigonometric cosine function.
	vec2 cos(vec2 angle);
	// The standard trigonometric cosine function.
	vec3 cos(vec3 angle);
	// The standard trigonometric cosine function.
	vec4 cos(vec4 angle);

	// The standard trigonometric tangent.
	float tan(float angle);
	// The standard trigonometric tangent.
	vec2 tan(vec2 angle);
	// The standard trigonometric tangent.
	vec3 tan(vec3 angle);
	// The standard trigonometric tangent.
	vec4 tan(vec4 angle);

	// Arc sine. Returns an angle whose sine is \`x\`. The range of values returned by this function is \`[-π/2, π/2]\`. Results are undefined if \`∣x∣>1\`.
	float asin(float x);
	// Arc sine. Returns an angle whose sine is \`x\`. The range of values returned by this function is \`[-π/2, π/2]\`. Results are undefined if \`∣x∣>1\`.
	vec2 asin(vec2 x);
	// Arc sine. Returns an angle whose sine is \`x\`. The range of values returned by this function is \`[-π/2, π/2]\`. Results are undefined if \`∣x∣>1\`.
	vec3 asin(vec3 x);
	// Arc sine. Returns an angle whose sine is \`x\`. The range of values returned by this function is \`[-π/2, π/2]\`. Results are undefined if \`∣x∣>1\`.
	vec4 asin(vec4 x);

	// Arc cosine. Returns an angle whose cosine is \`x\`. The range of values returned by this function is \`[0, π]\`. Results are undefined if \`∣x∣>1\`.
	float acos(float x);
	// Arc cosine. Returns an angle whose cosine is \`x\`. The range of values returned by this function is \`[0, π]\`. Results are undefined if \`∣x∣>1\`.
	vec2 acos(vec2 x);
	// Arc cosine. Returns an angle whose cosine is \`x\`. The range of values returned by this function is \`[0, π]\`. Results are undefined if \`∣x∣>1\`.
	vec3 acos(vec3 x);
	// Arc cosine. Returns an angle whose cosine is \`x\`. The range of values returned by this function is \`[0, π]\`. Results are undefined if \`∣x∣>1\`.
	vec4 acos(vec4 x);

	// Arc tangent. Returns an angle whose tangent is \`y/x\`. The signs of \`x\` and \`y\` are used to determine what quadrant the
	// angle is in. The range of values returned by this function is \`[−π,π]\`. Results are undefined if \`x\` and \`y\` are both 0.
	float atan(float y, float x);
	// Arc tangent. Returns an angle whose tangent is \`y/x\`. The signs of \`x\` and \`y\` are used to determine what quadrant the
	// angle is in. The range of values returned by this function is \`[−π,π]\`. Results are undefined if \`x\` and \`y\` are both 0.
	vec2 atan(vec2 y, vec2 x);
	// Arc tangent. Returns an angle whose tangent is \`y/x\`. The signs of \`x\` and \`y\` are used to determine what quadrant the
	// angle is in. The range of values returned by this function is \`[−π,π]\`. Results are undefined if \`x\` and \`y\` are both 0.
	vec3 atan(vec3 y, vec3 x);
	// Arc tangent. Returns an angle whose tangent is \`y/x\`. The signs of \`x\` and \`y\` are used to determine what quadrant the
	// angle is in. The range of values returned by this function is \`[−π,π]\`. Results are undefined if \`x\` and \`y\` are both 0.
	vec4 atan(vec4 y, vec4 x);

	// Arc tangent. Returns an angle whose tangent is \`y_over_x\`. The range of values returned by this function is \`[-π/2, π/2]\`.
	float atan(float y_over_x);
	// Arc tangent. Returns an angle whose tangent is \`y_over_x\`. The range of values returned by this function is \`[-π/2, π/2]\`.
	vec2 atan(vec2 y_over_x);
	// Arc tangent. Returns an angle whose tangent is \`y_over_x\`. The range of values returned by this function is \`[-π/2, π/2]\`.
	vec3 atan(vec3 y_over_x);
	// Arc tangent. Returns an angle whose tangent is \`y_over_x\`. The range of values returned by this function is \`[-π/2, π/2]\`.
	vec4 atan(vec4 y_over_x);

	////////////////////////////////////////////////////////////////////////////////
	// Exponential Functions

	// Returns \`x\` raised to the \`y\` power, i.e., \`xʸ\`. Results are undefined if \`x < 0\`. Results are undefined if \`x = 0\` and \`y <= 0\`.
	float pow(float x, float y);
	// Returns \`x\` raised to the \`y\` power, i.e., \`xʸ\`. Results are undefined if \`x < 0\`. Results are undefined if \`x = 0\` and \`y <= 0\`.
	vec2 pow(vec2 x, vec2 y);
	// Returns \`x\` raised to the \`y\` power, i.e., \`xʸ\`. Results are undefined if \`x < 0\`. Results are undefined if \`x = 0\` and \`y <= 0\`.
	vec3 pow(vec3 x, vec3 y);
	// Returns \`x\` raised to the \`y\` power, i.e., \`xʸ\`. Results are undefined if \`x < 0\`. Results are undefined if \`x = 0\` and \`y <= 0\`.
	vec4 pow(vec4 x, vec4 y);

	// Returns the natural exponentiation of \`x\`, i.e., \`eˣ\`
	float exp(float x);
	// Returns the natural exponentiation of \`x\`, i.e., \`eˣ\`
	vec2 exp(vec2 x);
	// Returns the natural exponentiation of \`x\`, i.e., \`eˣ\`
	vec3 exp(vec3 x);
	// Returns the natural exponentiation of \`x\`, i.e., \`eˣ\`
	vec4 exp(vec4 x);

	// Returns the natural logarithm of \`x\`, i.e., returns the value \`y\` which satisfies the equation \`x = eʸ\`. Results are undefined if \`x <= 0\`.
	float log(float x);
	// Returns the natural logarithm of \`x\`, i.e., returns the value \`y\` which satisfies the equation \`x = eʸ\`. Results are undefined if \`x <= 0\`.
	vec2 log(vec2 x);
	// Returns the natural logarithm of \`x\`, i.e., returns the value \`y\` which satisfies the equation \`x = eʸ\`. Results are undefined if \`x <= 0\`.
	vec3 log(vec3 x);
	// Returns the natural logarithm of \`x\`, i.e., returns the value \`y\` which satisfies the equation \`x = eʸ\`. Results are undefined if \`x <= 0\`.
	vec4 log(vec4 x);

	// Returns 2 raised to the \`x\` power, i.e., \`2ˣ\`.
	float exp2(float x);
	// Returns 2 raised to the \`x\` power, i.e., \`2ˣ\`.
	vec2 exp2(vec2 x);
	// Returns 2 raised to the \`x\` power, i.e., \`2ˣ\`.
	vec3 exp2(vec3 x);
	// Returns 2 raised to the \`x\` power, i.e., \`2ˣ\`.
	vec4 exp2(vec4 x);

	// Returns the base 2 logarithm of \`x\`, i.e., returns the value \`y\` which satisfies the equation \`x = 2ʸ\`. Results are undefined if \`x <= 0\`.
	float log2(float x);
	// Returns the base 2 logarithm of \`x\`, i.e., returns the value \`y\` which satisfies the equation \`x = 2ʸ\`. Results are undefined if \`x <= 0\`.
	vec2 log2(vec2 x);
	// Returns the base 2 logarithm of \`x\`, i.e., returns the value \`y\` which satisfies the equation \`x = 2ʸ\`. Results are undefined if \`x <= 0\`.
	vec3 log2(vec3 x);
	// Returns the base 2 logarithm of \`x\`, i.e., returns the value \`y\` which satisfies the equation \`x = 2ʸ\`. Results are undefined if \`x <= 0\`.
	vec4 log2(vec4 x);

	// Returns \`√x\`. Results are undefined if \`x < 0\`.
	float sqrt(float x);
	// Returns \`√x\`. Results are undefined if \`x < 0\`.
	vec2 sqrt(vec2 x);
	// Returns \`√x\`. Results are undefined if \`x < 0\`.
	vec3 sqrt(vec3 x);
	// Returns \`√x\`. Results are undefined if \`x < 0\`.
	vec4 sqrt(vec4 x);

	// Returns \`1 / √x\`. Results are undefined if \`x <= 0\`.
	float inversesqrt(float x);
	// Returns \`1 / √x\`. Results are undefined if \`x <= 0\`.
	vec2 inversesqrt(vec2 x);
	// Returns \`1 / √x\`. Results are undefined if \`x <= 0\`.
	vec3 inversesqrt(vec3 x);
	// Returns \`1 / √x\`. Results are undefined if \`x <= 0\`.
	vec4 inversesqrt(vec4 x);

	////////////////////////////////////////////////////////////////////////////////
	// Common Functions

	// Returns \`x\` if \`x >= 0\`, otherwise it returns \`-x\`.
	float abs(float x);
	// Returns \`x\` if \`x >= 0\`, otherwise it returns \`-x\`.
	vec2 abs(vec2 x);
	// Returns \`x\` if \`x >= 0\`, otherwise it returns \`-x\`.
	vec3 abs(vec3 x);
	// Returns \`x\` if \`x >= 0\`, otherwise it returns \`-x\`.
	vec4 abs(vec4 x);

	// Returns \`1.0\` if \`x > 0\`, \`0.0\` if \`x = 0\`, or \`-1.0\` if \`x < 0\`
	float sign(float x);
	// Returns \`1.0\` if \`x > 0\`, \`0.0\` if \`x = 0\`, or \`-1.0\` if \`x < 0\`
	vec2 sign(vec2 x);
	// Returns \`1.0\` if \`x > 0\`, \`0.0\` if \`x = 0\`, or \`-1.0\` if \`x < 0\`
	vec3 sign(vec3 x);
	// Returns \`1.0\` if \`x > 0\`, \`0.0\` if \`x = 0\`, or \`-1.0\` if \`x < 0\`
	vec4 sign(vec4 x);

	// Returns a value equal to the nearest integer that is less than or equal to \`x\`
	float floor(float x);
	// Returns a value equal to the nearest integer that is less than or equal to \`x\`
	vec2 floor(vec2 x);
	// Returns a value equal to the nearest integer that is less than or equal to \`x\`
	vec3 floor(vec3 x);
	// Returns a value equal to the nearest integer that is less than or equal to \`x\`
	vec4 floor(vec4 x);

	// Returns a value equal to the nearest integer that is greater than or equal to \`x\`
	float ceil(float x);
	// Returns a value equal to the nearest integer that is greater than or equal to \`x\`
	vec2 ceil(vec2 x);
	// Returns a value equal to the nearest integer that is greater than or equal to \`x\`
	vec3 ceil(vec3 x);
	// Returns a value equal to the nearest integer that is greater than or equal to \`x\`
	vec4 ceil(vec4 x);

	// Returns \`x - floor(x)\`
	float fract(float x);
	// Returns \`x - floor(x)\`
	vec2 fract(vec2 x);
	// Returns \`x - floor(x)\`
	vec3 fract(vec3 x);
	// Returns \`x - floor(x)\`
	vec4 fract(vec4 x);

	// Modulus (modulo). Returns \`x - y * floor(x/y)\`
	float mod(float x, float y);
	// Modulus (modulo). Returns \`x - y * floor(x/y)\`
	vec2 mod(vec2 x, float y);
	// Modulus (modulo). Returns \`x - y * floor(x/y)\`
	vec3 mod(vec3 x, float y);
	// Modulus (modulo). Returns \`x - y * floor(x/y)\`
	vec4 mod(vec4 x, float y);

	// Modulus. Returns \`x - y * floor(x/y)\`
	vec2 mod(vec2 x, vec2 y);
	// Modulus. Returns \`x - y * floor(x/y)\`
	vec3 mod(vec3 x, vec3 y);
	// Modulus. Returns \`x - y * floor(x/y)\`
	vec4 mod(vec4 x, vec4 y);

	// Returns \`y\` if \`y < x\`, otherwise it returns \`x\`
	float min(float x, float y);
	// Returns \`y\` if \`y < x\`, otherwise it returns \`x\`
	vec2 min(vec2 x, float y);
	// Returns \`y\` if \`y < x\`, otherwise it returns \`x\`
	vec2 min(vec2 x, vec2 y);
	// Returns \`y\` if \`y < x\`, otherwise it returns \`x\`
	vec3 min(vec3 x, float y);
	// Returns \`y\` if \`y < x\`, otherwise it returns \`x\`
	vec3 min(vec3 x, vec3 y);
	// Returns \`y\` if \`y < x\`, otherwise it returns \`x\`
	vec4 min(vec4 x, float y);
	// Returns \`y\` if \`y < x\`, otherwise it returns \`x\`
	vec4 min(vec4 x, vec4 y);

	// Returns \`y\` if \`x < y\`, otherwise it returns \`x\`
	float max(float x, float y);
	// Returns \`y\` if \`x < y\`, otherwise it returns \`x\`
	vec2 max(vec2 x, float y);
	// Returns \`y\` if \`x < y\`, otherwise it returns \`x\`
	vec2 max(vec2 x, vec2 y);
	// Returns \`y\` if \`x < y\`, otherwise it returns \`x\`
	vec3 max(vec3 x, float y);
	// Returns \`y\` if \`x < y\`, otherwise it returns \`x\`
	vec3 max(vec3 x, vec3 y);
	// Returns \`y\` if \`x < y\`, otherwise it returns \`x\`
	vec4 max(vec4 x, float y);
	// Returns \`y\` if \`x < y\`, otherwise it returns \`x\`
	vec4 max(vec4 x, vec4 y);

	// Returns \`min(max(x, minVal), maxVal)\`. Results are undefined if \`minVal > maxVal\`.
	float clamp(float x, float minVal, float maxVal);
	// Returns \`min(max(x, minVal), maxVal)\`. Results are undefined if \`minVal > maxVal\`.
	vec2 clamp(vec2 x, float minVal, float maxVal);
	// Returns \`min(max(x, minVal), maxVal)\`. Results are undefined if \`minVal > maxVal\`.
	vec2 clamp(vec2 x, vec2 minVal, vec2 maxVal);
	// Returns \`min(max(x, minVal), maxVal)\`. Results are undefined if \`minVal > maxVal\`.
	vec3 clamp(vec3 x, float minVal, float maxVal);
	// Returns \`min(max(x, minVal), maxVal)\`. Results are undefined if \`minVal > maxVal\`.
	vec3 clamp(vec3 x, vec3 minVal, vec3 maxVal);
	// Returns \`min(max(x, minVal), maxVal)\`. Results are undefined if \`minVal > maxVal\`.
	vec4 clamp(vec4 x, float minVal, float maxVal);
	// Returns \`min(max(x, minVal), maxVal)\`. Results are undefined if \`minVal > maxVal\`.
	vec4 clamp(vec4 x, vec4 minVal, vec4 maxVal);

	// Returns the linear blend of \`x\` and \`y\`, i.e. \`x * (1-a) + y * a\`
	float mix(float x, float y, float a);
	// Returns the linear blend of \`x\` and \`y\`, i.e. \`x * (1-a) + y * a\`
	vec2 mix(vec2 x, vec2 y, float a);
	// Returns the linear blend of \`x\` and \`y\`, i.e. \`x * (1-a) + y * a\`
	vec2 mix(vec2 x, vec2 y, vec2 a);
	// Returns the linear blend of \`x\` and \`y\`, i.e. \`x * (1-a) + y * a\`
	vec3 mix(vec3 x, vec3 y, float a);
	// Returns the linear blend of \`x\` and \`y\`, i.e. \`x * (1-a) + y * a\`
	vec3 mix(vec3 x, vec3 y, vec3 a);
	// Returns the linear blend of \`x\` and \`y\`, i.e. \`x * (1-a) + y * a\`
	vec4 mix(vec4 x, vec4 y, float a);
	// Returns the linear blend of \`x\` and \`y\`, i.e. \`x * (1-a) + y * a\`
	vec4 mix(vec4 x, vec4 y, vec4 a);

	// Returns \`0.0\` if \`x < edge\`, otherwise it returns \`1.0\`
	float step(float edge, float x);
	// Returns \`0.0\` if \`x < edge\`, otherwise it returns \`1.0\`
	vec2 step(float edge, vec2 x);
	// Returns \`0.0\` if \`x < edge\`, otherwise it returns \`1.0\`
	vec2 step(vec2 edge, vec2 x);
	// Returns \`0.0\` if \`x < edge\`, otherwise it returns \`1.0\`
	vec3 step(float edge, vec3 x);
	// Returns \`0.0\` if \`x < edge\`, otherwise it returns \`1.0\`
	vec3 step(vec3 edge, vec3 x);
	// Returns \`0.0\` if \`x < edge\`, otherwise it returns \`1.0\`
	vec4 step(float edge, vec4 x);
	// Returns \`0.0\` if \`x < edge\`, otherwise it returns \`1.0\`
	vec4 step(vec4 edge, vec4 x);

	// Returns \`0.0\` if \`x <= edge0\` and \`1.0\` if \`x >= edge1\` and performs smooth Hermite interpolation between 0 and 1 when \`edge0 < x < edge1\`.
	// This is useful in cases where you would want a threshold function with a smooth transition. This is equivalent to:
	//
	// \`\`\`glslx
	// float t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
	// return t * t * (3.0 - 2.0 * t);
	// \`\`\`
	//
	// Results are undefined if \`edge0 >= edge1\`.
	float smoothstep(float edge0, float edge1, float x);
	// Returns \`0.0\` if \`x <= edge0\` and \`1.0\` if \`x >= edge1\` and performs smooth Hermite interpolation between 0 and 1 when \`edge0 < x < edge1\`.
	// This is useful in cases where you would want a threshold function with a smooth transition. This is equivalent to:
	//
	// \`\`\`glslx
	// vec2 t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
	// return t * t * (3.0 - 2.0 * t);
	// \`\`\`
	//
	// Results are undefined if \`edge0 >= edge1\`.
	vec2 smoothstep(float edge0, float edge1, vec2 x);
	// Returns \`0.0\` if \`x <= edge0\` and \`1.0\` if \`x >= edge1\` and performs smooth Hermite interpolation between 0 and 1 when \`edge0 < x < edge1\`.
	// This is useful in cases where you would want a threshold function with a smooth transition. This is equivalent to:
	//
	// \`\`\`glslx
	// vec2 t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
	// return t * t * (3.0 - 2.0 * t);
	// \`\`\`
	//
	// Results are undefined if \`edge0 >= edge1\`.
	vec2 smoothstep(vec2 edge0, vec2 edge1, vec2 x);
	// Returns \`0.0\` if \`x <= edge0\` and \`1.0\` if \`x >= edge1\` and performs smooth Hermite interpolation between 0 and 1 when \`edge0 < x < edge1\`.
	// This is useful in cases where you would want a threshold function with a smooth transition. This is equivalent to:
	//
	// \`\`\`glslx
	// vec3 t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
	// return t * t * (3.0 - 2.0 * t);
	// \`\`\`
	//
	// Results are undefined if \`edge0 >= edge1\`.
	vec3 smoothstep(float edge0, float edge1, vec3 x);
	// Returns \`0.0\` if \`x <= edge0\` and \`1.0\` if \`x >= edge1\` and performs smooth Hermite interpolation between 0 and 1 when \`edge0 < x < edge1\`.
	// This is useful in cases where you would want a threshold function with a smooth transition. This is equivalent to:
	//
	// \`\`\`glslx
	// vec3 t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
	// return t * t * (3.0 - 2.0 * t);
	// \`\`\`
	//
	// Results are undefined if \`edge0 >= edge1\`.
	vec3 smoothstep(vec3 edge0, vec3 edge1, vec3 x);
	// Returns \`0.0\` if \`x <= edge0\` and \`1.0\` if \`x >= edge1\` and performs smooth Hermite interpolation between 0 and 1 when \`edge0 < x < edge1\`.
	// This is useful in cases where you would want a threshold function with a smooth transition. This is equivalent to:
	//
	// \`\`\`glslx
	// vec4 t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
	// return t * t * (3.0 - 2.0 * t);
	// \`\`\`
	//
	// Results are undefined if \`edge0 >= edge1\`.
	vec4 smoothstep(float edge0, float edge1, vec4 x);
	// Returns \`0.0\` if \`x <= edge0\` and \`1.0\` if \`x >= edge1\` and performs smooth Hermite interpolation between 0 and 1 when \`edge0 < x < edge1\`.
	// This is useful in cases where you would want a threshold function with a smooth transition. This is equivalent to:
	//
	// \`\`\`glslx
	// vec4 t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
	// return t * t * (3.0 - 2.0 * t);
	// \`\`\`
	//
	// Results are undefined if \`edge0 >= edge1\`.
	vec4 smoothstep(vec4 edge0, vec4 edge1, vec4 x);

	////////////////////////////////////////////////////////////////////////////////
	// Geometric Functions

	// Returns the length of vector \`x\`, i.e. \`√x²\`
	float length(float x);
	// Returns the length of vector \`x\`, i.e. \`√x[0]² + x[1]²\`
	float length(vec2 x);
	// Returns the length of vector \`x\`, i.e. \`√x[0]² + x[1]² + x[2]²\`
	float length(vec3 x);
	// Returns the length of vector \`x\`, i.e. \`√x[0]² + x[1]² + x[2]² + x[3]²\`
	float length(vec4 x);

	// Returns the distance between \`p0\` and \`p1\`, i.e. \`length(p0 - p1)\`
	float distance(float p0, float p1);
	// Returns the distance between \`p0\` and \`p1\`, i.e. \`length(p0 - p1)\`
	float distance(vec2 p0, vec2 p1);
	// Returns the distance between \`p0\` and \`p1\`, i.e. \`length(p0 - p1)\`
	float distance(vec3 p0, vec3 p1);
	// Returns the distance between \`p0\` and \`p1\`, i.e. \`length(p0 - p1)\`
	float distance(vec4 p0, vec4 p1);

	// Returns the dot product of \`x\` and \`y\`, i.e. \`x*y\`
	float dot(float x, float y);
	// Returns the dot product of \`x\` and \`y\`, i.e. \`x[0]*y[0] + x[1]*y[1]\`
	float dot(vec2 x, vec2 y);
	// Returns the dot product of \`x\` and \`y\`, i.e. \`x[0]*y[0] + x[1]*y[1] + x[2]*y[2]\`
	float dot(vec3 x, vec3 y);
	// Returns the dot product of \`x\` and \`y\`, i.e. \`x[0]*y[0] + x[1]*y[1] + x[2]*y[2] + x[3]*y[3]\`
	float dot(vec4 x, vec4 y);

	// Returns the cross product of \`x\` and \`y\`, i.e.
	//
	// \`\`\`glslx
	// vec3(
	//	 x[1]*y[2] - y[1]*x[2],
	//	 x[2]*y[0] - y[2]*x[0],
	//	 x[0]*y[1] - y[0]*x[1])
	// \`\`\`
	vec3 cross(vec3 x, vec3 y);

	// Returns a vector in the same direction as \`x\` but with a length of 1.
	float normalize(float x);
	// Returns a vector in the same direction as \`x\` but with a length of 1.
	vec2 normalize(vec2 x);
	// Returns a vector in the same direction as \`x\` but with a length of 1.
	vec3 normalize(vec3 x);
	// Returns a vector in the same direction as \`x\` but with a length of 1.
	vec4 normalize(vec4 x);

	// If \`dot(Nref, I) < 0\` return \`N\`, otherwise return \`-N\`
	float faceforward(float N, float I, float Nref);
	// If \`dot(Nref, I) < 0\` return \`N\`, otherwise return \`-N\`
	vec2 faceforward(vec2 N, vec2 I, vec2 Nref);
	// If \`dot(Nref, I) < 0\` return \`N\`, otherwise return \`-N\`
	vec3 faceforward(vec3 N, vec3 I, vec3 Nref);
	// If \`dot(Nref, I) < 0\` return \`N\`, otherwise return \`-N\`
	vec4 faceforward(vec4 N, vec4 I, vec4 Nref);

	// For the incident vector \`I\` and surface orientation \`N\`, returns the reflection direction: \`I - 2 * dot(N, I) * N\`.
	// \`N\` must already be normalized in order to achieve the desired result.
	float reflect(float I, float N);
	// For the incident vector \`I\` and surface orientation \`N\`, returns the reflection direction: \`I - 2 * dot(N, I) * N\`.
	// \`N\` must already be normalized in order to achieve the desired result.
	vec2 reflect(vec2 I, vec2 N);
	// For the incident vector \`I\` and surface orientation \`N\`, returns the reflection direction: \`I - 2 * dot(N, I) * N\`.
	// \`N\` must already be normalized in order to achieve the desired result.
	vec3 reflect(vec3 I, vec3 N);
	// For the incident vector \`I\` and surface orientation \`N\`, returns the reflection direction: \`I - 2 * dot(N, I) * N\`.
	// \`N\` must already be normalized in order to achieve the desired result.
	vec4 reflect(vec4 I, vec4 N);

	// For the incident vector \`I\` and surface normal \`N\`, and the ratio of indices of refraction \`eta\`, return the refraction vector.
	// The result is computed by:
	//
	// \`\`\`glslx
	// float k = 1.0 - eta * eta * (1.0 - dot(N, I) * dot(N, I));
	// if (k < 0.0) return float(0.0);
	// else return eta * I - (eta * dot(N, I) + sqrt(k)) * N;
	// \`\`\`
	//
	// The input parameters for the incident vector \`I\` and the surface normal \`N\`.
	float refract(float I, float N, float eta);
	// For the incident vector \`I\` and surface normal \`N\`, and the ratio of indices of refraction \`eta\`, return the refraction vector.
	// The result is computed by:
	//
	// \`\`\`glslx
	// float k = 1.0 - eta * eta * (1.0 - dot(N, I) * dot(N, I));
	// if (k < 0.0) return vec2(0.0);
	// else return eta * I - (eta * dot(N, I) + sqrt(k)) * N;
	// \`\`\`
	//
	// The input parameters for the incident vector \`I\` and the surface normal \`N\`.
	vec2 refract(vec2 I, vec2 N, float eta);
	// For the incident vector \`I\` and surface normal \`N\`, and the ratio of indices of refraction \`eta\`, return the refraction vector.
	// The result is computed by:
	//
	// \`\`\`glslx
	// float k = 1.0 - eta * eta * (1.0 - dot(N, I) * dot(N, I));
	// if (k < 0.0) return vec3(0.0);
	// else return eta * I - (eta * dot(N, I) + sqrt(k)) * N;
	// \`\`\`
	//
	// The input parameters for the incident vector \`I\` and the surface normal \`N\`.
	vec3 refract(vec3 I, vec3 N, float eta);
	// For the incident vector \`I\` and surface normal \`N\`, and the ratio of indices of refraction \`eta\`, return the refraction vector.
	// The result is computed by:
	//
	// \`\`\`glslx
	// float k = 1.0 - eta * eta * (1.0 - dot(N, I) * dot(N, I));
	// if (k < 0.0) return vec4(0.0);
	// else return eta * I - (eta * dot(N, I) + sqrt(k)) * N;
	// \`\`\`
	//
	// The input parameters for the incident vector \`I\` and the surface normal \`N\`.
	vec4 refract(vec4 I, vec4 N, float eta);

	////////////////////////////////////////////////////////////////////////////////
	// Matrix Functions

	// Multiply matrix \`x\` by matrix \`y\` component-wise, i.e., \`result[i][j]\` is the scalar product of \`x[i][j]\` and \`y[i][j]\`.
	// Note: to get linear algebraic matrix multiplication, use the multiply operator (\`*\`).
	mat2 matrixCompMult(mat2 x, mat2 y);
	// Multiply matrix \`x\` by matrix \`y\` component-wise, i.e., \`result[i][j]\` is the scalar product of \`x[i][j]\` and \`y[i][j]\`.
	// Note: to get linear algebraic matrix multiplication, use the multiply operator (\`*\`).
	mat3 matrixCompMult(mat3 x, mat3 y);
	// Multiply matrix \`x\` by matrix \`y\` component-wise, i.e., \`result[i][j]\` is the scalar product of \`x[i][j]\` and \`y[i][j]\`.
	// Note: to get linear algebraic matrix multiplication, use the multiply operator (\`*\`).
	mat4 matrixCompMult(mat4 x, mat4 y);

	////////////////////////////////////////////////////////////////////////////////
	// Vector Relational Functions

	// Returns the component-wise compare of \`x < y\`.
	bvec2 lessThan(ivec2 x, ivec2 y);
	// Returns the component-wise compare of \`x < y\`.
	bvec2 lessThan(vec2 x, vec2 y);
	// Returns the component-wise compare of \`x < y\`.
	bvec3 lessThan(ivec3 x, ivec3 y);
	// Returns the component-wise compare of \`x < y\`.
	bvec3 lessThan(vec3 x, vec3 y);
	// Returns the component-wise compare of \`x < y\`.
	bvec4 lessThan(ivec4 x, ivec4 y);
	// Returns the component-wise compare of \`x < y\`.
	bvec4 lessThan(vec4 x, vec4 y);

	// Returns the component-wise compare of \`x <= y\`.
	bvec2 lessThanEqual(ivec2 x, ivec2 y);
	// Returns the component-wise compare of \`x <= y\`.
	bvec2 lessThanEqual(vec2 x, vec2 y);
	// Returns the component-wise compare of \`x <= y\`.
	bvec3 lessThanEqual(ivec3 x, ivec3 y);
	// Returns the component-wise compare of \`x <= y\`.
	bvec3 lessThanEqual(vec3 x, vec3 y);
	// Returns the component-wise compare of \`x <= y\`.
	bvec4 lessThanEqual(ivec4 x, ivec4 y);
	// Returns the component-wise compare of \`x <= y\`.
	bvec4 lessThanEqual(vec4 x, vec4 y);

	// Returns the component-wise compare of \`x > y\`.
	bvec2 greaterThan(ivec2 x, ivec2 y);
	// Returns the component-wise compare of \`x > y\`.
	bvec2 greaterThan(vec2 x, vec2 y);
	// Returns the component-wise compare of \`x > y\`.
	bvec3 greaterThan(ivec3 x, ivec3 y);
	// Returns the component-wise compare of \`x > y\`.
	bvec3 greaterThan(vec3 x, vec3 y);
	// Returns the component-wise compare of \`x > y\`.
	bvec4 greaterThan(ivec4 x, ivec4 y);
	// Returns the component-wise compare of \`x > y\`.
	bvec4 greaterThan(vec4 x, vec4 y);

	// Returns the component-wise compare of \`x >= y\`.
	bvec2 greaterThanEqual(ivec2 x, ivec2 y);
	// Returns the component-wise compare of \`x >= y\`.
	bvec2 greaterThanEqual(vec2 x, vec2 y);
	// Returns the component-wise compare of \`x >= y\`.
	bvec3 greaterThanEqual(ivec3 x, ivec3 y);
	// Returns the component-wise compare of \`x >= y\`.
	bvec3 greaterThanEqual(vec3 x, vec3 y);
	// Returns the component-wise compare of \`x >= y\`.
	bvec4 greaterThanEqual(ivec4 x, ivec4 y);
	// Returns the component-wise compare of \`x >= y\`.
	bvec4 greaterThanEqual(vec4 x, vec4 y);

	// Returns the component-wise compare of \`x == y\`.
	bvec2 equal(bvec2 x, bvec2 y);
	// Returns the component-wise compare of \`x == y\`.
	bvec2 equal(ivec2 x, ivec2 y);
	// Returns the component-wise compare of \`x == y\`.
	bvec2 equal(vec2 x, vec2 y);
	// Returns the component-wise compare of \`x == y\`.
	bvec3 equal(bvec3 x, bvec3 y);
	// Returns the component-wise compare of \`x == y\`.
	bvec3 equal(ivec3 x, ivec3 y);
	// Returns the component-wise compare of \`x == y\`.
	bvec3 equal(vec3 x, vec3 y);
	// Returns the component-wise compare of \`x == y\`.
	bvec4 equal(bvec4 x, bvec4 y);
	// Returns the component-wise compare of \`x == y\`.
	bvec4 equal(ivec4 x, ivec4 y);
	// Returns the component-wise compare of \`x == y\`.
	bvec4 equal(vec4 x, vec4 y);

	// Returns the component-wise compare of \`x != y\`.
	bvec2 notEqual(bvec2 x, bvec2 y);
	// Returns the component-wise compare of \`x != y\`.
	bvec2 notEqual(ivec2 x, ivec2 y);
	// Returns the component-wise compare of \`x != y\`.
	bvec2 notEqual(vec2 x, vec2 y);
	// Returns the component-wise compare of \`x != y\`.
	bvec3 notEqual(bvec3 x, bvec3 y);
	// Returns the component-wise compare of \`x != y\`.
	bvec3 notEqual(ivec3 x, ivec3 y);
	// Returns the component-wise compare of \`x != y\`.
	bvec3 notEqual(vec3 x, vec3 y);
	// Returns the component-wise compare of \`x != y\`.
	bvec4 notEqual(bvec4 x, bvec4 y);
	// Returns the component-wise compare of \`x != y\`.
	bvec4 notEqual(ivec4 x, ivec4 y);
	// Returns the component-wise compare of \`x != y\`.
	bvec4 notEqual(vec4 x, vec4 y);

	// Returns true if any component of \`x\` is \`true\`.
	bool any(bvec2 x);
	// Returns true if any component of \`x\` is \`true\`.
	bool any(bvec3 x);
	// Returns true if any component of \`x\` is \`true\`.
	bool any(bvec4 x);

	// Returns true only if all components of \`x\` are \`true\`.
	bool all(bvec2 x);
	// Returns true only if all components of \`x\` are \`true\`.
	bool all(bvec3 x);
	// Returns true only if all components of \`x\` are \`true\`.
	bool all(bvec4 x);

	// Returns the component-wise logical complement of \`x\`.
	bvec2 not(bvec2 x);
	// Returns the component-wise logical complement of \`x\`.
	bvec3 not(bvec3 x);
	// Returns the component-wise logical complement of \`x\`.
	bvec4 not(bvec4 x);

	////////////////////////////////////////////////////////////////////////////////
	// Texture Lookup Functions

	// Use the texture coordinate \`coord\` to do a texture lookup in the 2D texture currently bound to \`sampler\`.
	vec4 texture2D(sampler2D sampler, vec2 coord);
	// Use the texture coordinate \`coord\` to do a texture lookup in the 2D texture currently bound to \`sampler\`.
	vec4 texture2D(sampler2D sampler, vec2 coord, float bias);
	// Use the texture coordinate \`coord\` to do a texture lookup in the 2D texture currently bound to \`sampler\`.
	vec4 texture2DLod(sampler2D sampler, vec2 coord, float lod);
	// Use the texture coordinate \`coord\` to do a texture lookup in the 2D texture currently bound to \`sampler\`.
	// The texture coordinate \`(coord.s, coord.t)\` is divided by the last component of \`coord\`.
	vec4 texture2DProj(sampler2D sampler, vec3 coord);
	// Use the texture coordinate \`coord\` to do a texture lookup in the 2D texture currently bound to \`sampler\`.
	// The texture coordinate \`(coord.s, coord.t)\` is divided by the last component of \`coord\`.
	vec4 texture2DProj(sampler2D sampler, vec3 coord, float bias);
	// Use the texture coordinate \`coord\` to do a texture lookup in the 2D texture currently bound to \`sampler\`.
	// The texture coordinate \`(coord.s, coord.t)\` is divided by the last component of \`coord\`.
	vec4 texture2DProjLod(sampler2D sampler, vec3 coord, float lod);
	// Use the texture coordinate \`coord\` to do a texture lookup in the 2D texture currently bound to \`sampler\`.
	// The texture coordinate \`(coord.s, coord.t)\` is divided by the last component of \`coord\`. The third component of \`coord\` is ignored.
	vec4 texture2DProj(sampler2D sampler, vec4 coord);
	// Use the texture coordinate \`coord\` to do a texture lookup in the 2D texture currently bound to \`sampler\`.
	// The texture coordinate \`(coord.s, coord.t)\` is divided by the last component of \`coord\`. The third component of \`coord\` is ignored.
	vec4 texture2DProj(sampler2D sampler, vec4 coord, float bias);
	// Use the texture coordinate \`coord\` to do a texture lookup in the 2D texture currently bound to \`sampler\`.
	// The texture coordinate \`(coord.s, coord.t)\` is divided by the last component of \`coord\`. The third component of \`coord\` is ignored.
	vec4 texture2DProjLod(sampler2D sampler, vec4 coord, float lod);

	// Use the texture coordinate \`coord\` to do a texture lookup in the cube map texture currently bound to \`sampler\`.
	// The direction of \`coord\` is used to select which face to do a 2-dimensional texture lookup in.
	vec4 textureCube(samplerCube sampler, vec3 coord);
	// Use the texture coordinate \`coord\` to do a texture lookup in the cube map texture currently bound to \`sampler\`.
	// The direction of \`coord\` is used to select which face to do a 2-dimensional texture lookup in.
	vec4 textureCube(samplerCube sampler, vec3 coord, float bias);
	// Use the texture coordinate \`coord\` to do a texture lookup in the cube map texture currently bound to \`sampler\`.
	// The direction of \`coord\` is used to select which face to do a 2-dimensional texture lookup in.
	vec4 textureCubeLod(samplerCube sampler, vec3 coord, float lod);

	#extension GL_OES_standard_derivatives {
		// Available only in the fragment shader, this function returns the partial derivative of expression \`p\` with respect to the window \`x\` coordinate.
		//
		// Expressions that imply higher order derivatives such as \`dFdx(dFdx(n))\` have undefined results, as do mixed-order derivatives such as
		// \`dFdx(dFdy(n))\`. It is assumed that the expression \`p\` is continuous and therefore, expressions evaluated via non-uniform control flow may be undefined.
		float dFdx(float v);
		// Available only in the fragment shader, this function returns the partial derivative of expression \`p\` with respect to the window \`x\` coordinate.
		//
		// Expressions that imply higher order derivatives such as \`dFdx(dFdx(n))\` have undefined results, as do mixed-order derivatives such as
		// \`dFdx(dFdy(n))\`. It is assumed that the expression \`p\` is continuous and therefore, expressions evaluated via non-uniform control flow may be undefined.
		vec2 dFdx(vec2 v);
		// Available only in the fragment shader, this function returns the partial derivative of expression \`p\` with respect to the window \`x\` coordinate.
		//
		// Expressions that imply higher order derivatives such as \`dFdx(dFdx(n))\` have undefined results, as do mixed-order derivatives such as
		// \`dFdx(dFdy(n))\`. It is assumed that the expression \`p\` is continuous and therefore, expressions evaluated via non-uniform control flow may be undefined.
		vec3 dFdx(vec3 v);
		// Available only in the fragment shader, this function returns the partial derivative of expression \`p\` with respect to the window \`x\` coordinate.
		//
		// Expressions that imply higher order derivatives such as \`dFdx(dFdx(n))\` have undefined results, as do mixed-order derivatives such as
		// \`dFdx(dFdy(n))\`. It is assumed that the expression \`p\` is continuous and therefore, expressions evaluated via non-uniform control flow may be undefined.
		vec4 dFdx(vec4 v);

		// Available only in the fragment shader, this function returns the partial derivative of expression \`p\` with respect to the window \`y\` coordinate.
		//
		// Expressions that imply higher order derivatives such as \`dFdy(dFdy(n))\` have undefined results, as do mixed-order derivatives such as
		// \`dFdx(dFdy(n))\`. It is assumed that the expression \`p\` is continuous and therefore, expressions evaluated via non-uniform control flow may be undefined.
		float dFdy(float v);
		// Available only in the fragment shader, this function returns the partial derivative of expression \`p\` with respect to the window \`y\` coordinate.
		//
		// Expressions that imply higher order derivatives such as \`dFdy(dFdy(n))\` have undefined results, as do mixed-order derivatives such as
		// \`dFdx(dFdy(n))\`. It is assumed that the expression \`p\` is continuous and therefore, expressions evaluated via non-uniform control flow may be undefined.
		vec2 dFdy(vec2 v);
		// Available only in the fragment shader, this function returns the partial derivative of expression \`p\` with respect to the window \`y\` coordinate.
		//
		// Expressions that imply higher order derivatives such as \`dFdy(dFdy(n))\` have undefined results, as do mixed-order derivatives such as
		// \`dFdx(dFdy(n))\`. It is assumed that the expression \`p\` is continuous and therefore, expressions evaluated via non-uniform control flow may be undefined.
		vec3 dFdy(vec3 v);
		// Available only in the fragment shader, this function returns the partial derivative of expression \`p\` with respect to the window \`y\` coordinate.
		//
		// Expressions that imply higher order derivatives such as \`dFdy(dFdy(n))\` have undefined results, as do mixed-order derivatives such as
		// \`dFdx(dFdy(n))\`. It is assumed that the expression \`p\` is continuous and therefore, expressions evaluated via non-uniform control flow may be undefined.
		vec4 dFdy(vec4 v);

		// Returns the sum of the absolute derivative in \`x\` and \`y\` using local differencing for the input argument \`p\`, i.e. \`abs(dFdx(p)) + abs(dFdy(p))\`
		float fwidth(float v);
		// Returns the sum of the absolute derivative in \`x\` and \`y\` using local differencing for the input argument \`p\`, i.e. \`abs(dFdx(p)) + abs(dFdy(p))\`
		vec2 fwidth(vec2 v);
		// Returns the sum of the absolute derivative in \`x\` and \`y\` using local differencing for the input argument \`p\`, i.e. \`abs(dFdx(p)) + abs(dFdy(p))\`
		vec3 fwidth(vec3 v);
		// Returns the sum of the absolute derivative in \`x\` and \`y\` using local differencing for the input argument \`p\`, i.e. \`abs(dFdx(p)) + abs(dFdy(p))\`
		vec4 fwidth(vec4 v);
	}

	#extension GL_EXT_frag_depth {
		// Available only in the fragment language, \`gl_FragDepthEXT\` is an output variable that is used to establish the depth value for the current fragment.
		// If depth buffering is enabled and no shader writes to \`gl_FragDepthEXT\`, then the fixed function value for depth will be used (this value is contained
		// in the \`z\` component of \`gl_FragCoord\`) otherwise, the value written to \`gl_FragDepthEXT\` is used.
		//
		// If a shader statically assigns to \`gl_FragDepthEXT\`, then the value of the fragment's depth may be undefined for executions of the shader that take
		// that path. That is, if the set of linked fragment shaders statically contain a write to \`gl_FragDepthEXT\`, then it is responsible for always writing it.
		float gl_FragDepthEXT;
	}

	#extension GL_EXT_shader_texture_lod {
		vec4 texture2DGradEXT(sampler2D sampler, vec2 P, vec2 dPdx, vec2 dPdy);
		vec4 texture2DLodEXT(sampler2D sampler, vec2 coord, float lod);
		vec4 texture2DProjGradEXT(sampler2D sampler, vec3 P, vec2 dPdx, vec2 dPdy);
		vec4 texture2DProjGradEXT(sampler2D sampler, vec4 P, vec2 dPdx, vec2 dPdy);
		vec4 texture2DProjLodEXT(sampler2D sampler, vec3 coord, float lod);
		vec4 texture2DProjLodEXT(sampler2D sampler, vec4 coord, float lod);
		vec4 textureCubeGradEXT(samplerCube sampler, vec3 P, vec3 dPdx, vec3 dPdy);
		vec4 textureCubeLodEXT(samplerCube sampler, vec3 coord, float lod);
	}
}
`;
