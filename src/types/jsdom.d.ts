declare module "jsdom" {
  export interface JSDOMOptions {
    url?: string;
  }

  export class JSDOM {
    constructor(html?: string, options?: JSDOMOptions);
    window: Window;
  }
}
