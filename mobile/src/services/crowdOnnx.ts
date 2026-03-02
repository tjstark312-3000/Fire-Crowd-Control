import { InferenceSession, Tensor } from "onnxruntime-react-native";

const IMAGENET_MEAN = [0.485, 0.456, 0.406] as const;
const IMAGENET_STD = [0.229, 0.224, 0.225] as const;

export type CrowdInferenceResult = {
  crowdCount: number;
  densityMap: Float32Array;
  outHeight: number;
  outWidth: number;
};

export async function createCrowdSession(modelPathOrAsset: string | number): Promise<InferenceSession> {
  return InferenceSession.create(modelPathOrAsset as never);
}

export function rgbaToNormalizedCHW(
  rgbaFrame: Uint8Array,
  width: number,
  height: number,
): Float32Array {
  const pixelCount = width * height;
  const chw = new Float32Array(3 * pixelCount);

  for (let i = 0; i < pixelCount; i += 1) {
    const r = rgbaFrame[i * 4] / 255.0;
    const g = rgbaFrame[i * 4 + 1] / 255.0;
    const b = rgbaFrame[i * 4 + 2] / 255.0;

    chw[i] = (r - IMAGENET_MEAN[0]) / IMAGENET_STD[0];
    chw[pixelCount + i] = (g - IMAGENET_MEAN[1]) / IMAGENET_STD[1];
    chw[2 * pixelCount + i] = (b - IMAGENET_MEAN[2]) / IMAGENET_STD[2];
  }

  return chw;
}

function sumDensity(data: Float32Array): number {
  let total = 0;
  for (let i = 0; i < data.length; i += 1) {
    total += data[i];
  }
  return total;
}

export async function inferCrowdDensity(
  session: InferenceSession,
  inputCHW: Float32Array,
  inputHeight: number,
  inputWidth: number,
): Promise<CrowdInferenceResult> {
  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0];
  const inputTensor = new Tensor("float32", inputCHW, [1, 3, inputHeight, inputWidth]);
  const outputs = await session.run({ [inputName]: inputTensor });
  const outputTensor = outputs[outputName] as Tensor;

  const dims = outputTensor.dims;
  const data = outputTensor.data as Float32Array;
  const outHeight = dims.length >= 3 ? Number(dims[dims.length - 2]) : inputHeight;
  const outWidth = dims.length >= 2 ? Number(dims[dims.length - 1]) : inputWidth;
  const crowdCount = sumDensity(data);

  return {
    crowdCount,
    densityMap: data,
    outHeight,
    outWidth,
  };
}
