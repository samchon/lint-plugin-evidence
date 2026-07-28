import { WebSocketAdaptor } from "@nestia/core";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { MyConfiguration } from "./MyConfiguration";
import { MyModule } from "./MyModule";

export class MyBackend {
  private application_?: INestApplication;
  private closing_?: Promise<void>;

  public async open(): Promise<void> {
    this.application_ = await NestFactory.create(MyModule, { logger: false });
    await WebSocketAdaptor.upgrade(this.application_);
    this.application_.enableCors();
    await this.application_.listen(MyConfiguration.API_PORT(), "0.0.0.0");
    if (process.send) process.send("ready");
  }

  public async close(): Promise<void> {
    if (this.closing_ !== undefined) return this.closing_;
    if (this.application_ === undefined) return;

    const application: INestApplication = this.application_;
    delete this.application_;
    this.closing_ = application.close();
    try {
      await this.closing_;
    } finally {
      delete this.closing_;
    }
  }
}
