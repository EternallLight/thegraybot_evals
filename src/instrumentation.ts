/**
 * Langfuse OpenTelemetry instrumentation.
 *
 * This MUST be imported before any `generateText` call so the tracer is running when
 * the agent fires. The seed and the `try` script both import it as their FIRST line.
 *
 * The AI SDK emits OTel spans when `experimental_telemetry.isEnabled` is true;
 * `LangfuseSpanProcessor` captures them and ships them to Langfuse. It reads
 * LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY / LANGFUSE_BASE_URL from the environment.
 */
import "dotenv/config";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";

export const langfuseSpanProcessor = new LangfuseSpanProcessor();

const sdk = new NodeSDK({
  spanProcessors: [langfuseSpanProcessor],
});

sdk.start();

/**
 * Spans are batched. In a short-lived CLI script they'd be lost on exit, so callers
 * MUST flush before the process ends: `await flushTelemetry()`.
 */
export async function flushTelemetry(): Promise<void> {
  await langfuseSpanProcessor.forceFlush();
  await sdk.shutdown();
}
