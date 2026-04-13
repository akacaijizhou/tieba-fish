/*
 * @Description  : 
 * @Author       : cjz
 * @Date         : 2026-04-13 10:44:10
 * @LastEditors  : cjz
 * @LastEditTime : 2026-04-13 14:42:51
 * @FilePath     : \\undefinedd:\\companycode\\tieba\\client-dashboard\\src\\app.ts
 * Copyright (C) 2026 cjz. All rights reserved.
 */
import { fetchMetrics } from "./api/client";

async function bootstrap(): Promise<void> {
  const metrics = await fetchMetrics();
  const summary = metrics.map((item) => `${item.name}:${item.value}`).join(", ");
  console.log(`dashboard summary => ${summary}`);
}

void bootstrap();