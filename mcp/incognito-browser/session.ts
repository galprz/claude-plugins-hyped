import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { execSync } from 'child_process'
import { dirname } from 'path'

export class Session {
  private browser: Browser | null = null
  private context: BrowserContext | null = null
  private page: Page | null = null
  private recordingOutputPath: string | null = null

  private headless(): boolean {
    return process.env.INCOGNITO_HEADLESS !== 'false'
  }

  private async init(contextOptions: Parameters<Browser['newContext']>[0] = {}): Promise<void> {
    if (this.browser) await this.browser.close()
    this.browser = await chromium.launch({ headless: this.headless() })
    this.context = await this.browser.newContext(contextOptions)
    this.page = await this.context.newPage()
  }

  async getPage(): Promise<Page> {
    if (!this.page) await this.init()
    return this.page!
  }

  async startRecording(outputPath: string): Promise<void> {
    this.recordingOutputPath = outputPath
    await this.init({ recordVideo: { dir: dirname(outputPath) } })
  }

  async stopRecording(): Promise<string> {
    if (!this.page || !this.context || !this.browser || !this.recordingOutputPath) {
      throw new Error('No recording in progress')
    }
    const video = this.page.video()!
    await this.context.close()
    const webmPath = await video.path()
    await this.browser.close()
    execSync(`ffmpeg -i "${webmPath}" -c:v libx264 -pix_fmt yuv420p "${this.recordingOutputPath}" -y`)
    const result = this.recordingOutputPath
    this.browser = null
    this.context = null
    this.page = null
    this.recordingOutputPath = null
    return result
  }

  async close(): Promise<void> {
    if (this.browser) await this.browser.close()
    this.browser = null
    this.context = null
    this.page = null
    this.recordingOutputPath = null
  }
}
