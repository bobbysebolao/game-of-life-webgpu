import { cellShaderProgram } from "./shaders.js";

/* Global variables */
const GRID_SIZE = 32;
const UPDATE_INTERVAL = 200; // Update every 200ms (5 times/sec)

let step = 0; // Track how many simulation steps have been run

const canvas = document.querySelector("canvas");
// Handle the case where a user's browser doesn't support WebGPU
if (!navigator.gpu) {
  throw new Error("WebGPU is not supported in this browser");
}
// an adapter is WebGPU's reference to the graphics card on the user's device
const adapter = await navigator.gpu.requestAdapter();
// Handle the case where a user's browser supports WebGPU, but their graphics card doesn't
if (!adapter) {
  throw new Error("No appropriate graphics card or GPUAdapter found.");
}

const device = await adapter.requestDevice();

function updateGrid() {
  step++; // increment the step count to change the grid render state
  // Initialise state for each cell in the grid
  const cellStateArray = new Uint32Array(GRID_SIZE * GRID_SIZE);
  const cellStateStorageBuffers = [
    device.createBuffer({
      label: "Cell State A",
      size: cellStateArray.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    }),
    device.createBuffer({
      label: "Cell State B",
      size: cellStateArray.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    }),
  ];

  // Update state for every third cell to be 'active'
  for (let i = 0; i < cellStateArray.length; i += 3) {
    cellStateArray[i] = 1;
  }

  device.queue.writeBuffer(cellStateStorageBuffers[0], 0, cellStateArray);

  // Note: once you call writeBuffer(), you don't have to preserve the contents of the source TypedArray any more.
  // We are free to mutate the source array from this line onwards

  // Update state for every second cell to be 'active'
  for (let i = 0; i < cellStateArray.length; i++) {
    cellStateArray[i] = 1 % 2;
  }

  device.queue.writeBuffer(cellStateStorageBuffers[1], 0, cellStateArray);

  const gridSizeUniformArray = new Float32Array([GRID_SIZE, GRID_SIZE]);
  const gridSizeUniformBuffer = device.createBuffer({
    label: "Grid Uniforms", // labels are optional, but strongly recommended for debugging
    size: gridSizeUniformArray.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  device.queue.writeBuffer(gridSizeUniformBuffer, 0, gridSizeUniformArray);

  const context = canvas.getContext("webgpu");
  // Defines the texture format that the canvas receiving drawings from the specified device should use.
  // Certain devices perform better when they are outputting texture in certain formats.
  // But most of the time, the browser will set a sensible format with getPreferredCanvasFormat().
  // So it's not something you normally need to set manually.
  const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
  const vertices = new Float32Array([
    -0.8,
    -0.8, // bl
    0.8,
    -0.8, // br
    0.8,
    0.8, // tr

    -0.8,
    -0.8, // bl
    -0.8,
    0.8, // tl
    0.8,
    0.8, // tr
  ]);

  // Note: vertices.byteLength is like array.length, but instead of returning the actual length of the array,
  // it returns the number of bytes-worth of information contained in the array.
  // (in this case, 4 bytes (because a 32 bit floating point integer === 4 bytes) x 12 (because there are 12 vertices) = 48 bytes)
  const vertexBuffer = device.createBuffer({
    label: "Cell vertices",
    size: vertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });

  device.queue.writeBuffer(vertexBuffer, /*bufferOffset=*/ 0, vertices);

  const vertexBufferLayout = {
    arrayStride: 8, // number of bytes the GPU needs to skip forward in memory to render each subsequent vertex
    attributes: [
      {
        format: "float32x2",
        offset: 0,
        shaderLocation: 0, // Position, see vertex shader
      },
    ],
  };

  const cellShaderModule = device.createShaderModule({
    label: "Cell shader",
    code: cellShaderProgram,
  });

  const cellPipeline = device.createRenderPipeline({
    label: "Cell pipeline",
    layout: "auto",
    vertex: {
      module: cellShaderModule,
      entryPoint: "vertexMain",
      buffers: [vertexBufferLayout],
    },
    fragment: {
      module: cellShaderModule,
      entryPoint: "fragmentMain",
      targets: [
        {
          format: canvasFormat,
        },
      ],
    },
  });

  // You need to set up a bind group in order to be able to pass 'global variables' to a shader program
  // The two types of veriables we're passing via this bind group are a 'uniform' buffer and a 'storage' buffer
  // Uniform buffers are limited in size
  const bindGroups = [
    device.createBindGroup({
      label: "Cell renderer bind group A",
      layout: cellPipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: { buffer: gridSizeUniformBuffer },
        },
        {
          binding: 1,
          resource: { buffer: cellStateStorageBuffers[0] },
        },
      ],
    }),
    device.createBindGroup({
      label: "Cell renderer bind group B",
      layout: cellPipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: { buffer: gridSizeUniformBuffer },
        },
        {
          binding: 1,
          resource: { buffer: cellStateStorageBuffers[1] },
        },
      ],
    }),
  ];

  context.configure({
    device,
    format: canvasFormat,
  });

  const encoder = device.createCommandEncoder();

  const currentTexture = context.getCurrentTexture();
  const renderPass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: currentTexture.createView(),
        loadOp: "clear",
        clearValue: { r: 0, g: 0, b: 0.4, a: 1.0 },
        storeOp: "store",
      },
    ],
  });

  renderPass.setPipeline(cellPipeline);
  renderPass.setVertexBuffer(0, vertexBuffer);

  renderPass.setBindGroup(0, bindGroups[step % 2]);

  renderPass.draw(vertices.length / 2, GRID_SIZE * GRID_SIZE); // 1st arg = 6 vertices, 2nd arg = 32 * 32 instances

  renderPass.end();

  // Time to submit the command that has been prepared to the GPU queue.
  // The GPU will handle sensibly ordering the commands that have been
  // submmitted to run on it.
  const commandBuffer = encoder.finish();
  device.queue.submit([commandBuffer]);
}

// Schedule updateGrid() to run repeatedly
setInterval(updateGrid, UPDATE_INTERVAL);
