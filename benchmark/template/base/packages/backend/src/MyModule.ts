import { Module } from "@nestjs/common";

import { HealController } from "./controllers/HealController";

@Module({
  controllers: [HealController],
})
export class MyModule {}
