import { spawn, type ChildProcess } from 'child_process'
import { existsSync, mkdirSync } from 'fs'
import { dirname } from 'path'

interface Recording {
  proc: ChildProcess
  path: string
  interval: ReturnType<typeof setInterval>
}

export class RecordingManager {
  private recordings = new Map<string, Recording>()

  isRecording(sessionId: string): boolean {
    return this.recordings.has(sessionId)
  }

  start(
    sessionId: string,
    outputPath: string,
    captureFrame: () => Promise<Buffer>
  ): void {
    if (this.recordings.has(sessionId)) {
      throw new Error(`Session ${sessionId}: already recording`)
    }

    const dir = dirname(outputPath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    const proc = spawn('ffmpeg', [
      '-y',
      '-f', 'image2pipe',
      '-r', '10',
      '-i', 'pipe:0',
      '-vf', 'scale=1280:-2',
      '-c:v', 'libx264',
      '-crf', '20',
      '-pix_fmt', 'yuv420p',
      '-r', '30',
      outputPath,
    ], { stdio: ['pipe', 'ignore', 'ignore'] })

    const interval = setInterval(async () => {
      try {
        const frame = await captureFrame()
        if (proc.stdin?.writable) proc.stdin.write(frame)
      } catch { /* chrome may be busy */ }
    }, 100)

    proc.on('exit', () => {
      clearInterval(interval)
      this.recordings.delete(sessionId)
    })

    this.recordings.set(sessionId, { proc, path: outputPath, interval })
  }

  async stop(sessionId: string): Promise<string> {
    const rec = this.recordings.get(sessionId)
    if (!rec) throw new Error(`Session ${sessionId}: not recording`)

    clearInterval(rec.interval)
    this.recordings.delete(sessionId)

    return new Promise((resolve, reject) => {
      rec.proc.on('exit', (code) => {
        if (code === 0 || code === null) resolve(rec.path)
        else reject(new Error(`ffmpeg exited with code ${code}. Output: ${rec.path}`))
      })
      rec.proc.stdin?.end()
    })
  }

  stopAll(): void {
    for (const [sessionId] of this.recordings) {
      const rec = this.recordings.get(sessionId)!
      clearInterval(rec.interval)
      rec.proc.stdin?.end()
      this.recordings.delete(sessionId)
    }
  }
}
