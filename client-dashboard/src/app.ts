import { fetchMetrics } from "./api/client";

async function bootstrap(): Promise<void> {
  const metrics = await fetchMetrics();
  const summary = metrics.map((item) => `${item.name}:${item.value}`).join(", ");
  console.log(`dashboard summary => ${summary}`);
}

void bootstrap();
