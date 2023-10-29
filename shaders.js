const vertexShader = `
struct VertexInput {
    @location(0) pos: vec2f,
    @builtin(instance_index) instance: u32,
};

struct VertexOutput {
    @builtin(position) pos: vec4f,
    @location(0) cell: vec2f,
};

@group(0) @binding(0) var<uniform> grid: vec2f;
@group(0) @binding(1) var<storage> cellState: array<u32>;

// Vertex shader code here
@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    let i = f32(input.instance); // save the instance index as a float
    let cellX = i % grid.x; // how does this work?
    let cellY = floor(i / grid.x); // ??
    let cell = vec2f(cellX, cellY); // x/y webgpu coords representing the top right corner of the canvas
    let state = f32(cellState[input.instance]);
    let cellOffset = (cell / grid) * 2; // Compute the offset to cell
    let currentCellPos = (((input.pos * state + 1) / grid) - 1); // -1 to move the cell down and to the left by half of the webgl canvas clip space
    let gridPos = currentCellPos + cellOffset; // cell position, without cell state applied


    var output: VertexOutput; // in wgsl 'var' is the equivalent of var/let in js
    output.pos = vec4f(gridPos, 0, 1); // (x, y, z, w);
    output.cell = cell;
    return output;
}
`;

const fragmentShader = `
// Fragment shader code here
@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
    let c = input.cell / grid;
    return vec4f(c, 1 - c.y, 1); // (r, g, b, a)
}
`;

export const cellShaderProgram = vertexShader.concat(fragmentShader);
