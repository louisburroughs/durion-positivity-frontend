export class Upload {
  public start: () => void;
  public abort: (retry?: boolean) => Promise<void>;
  public findPreviousUploads: () => Promise<Array<{ uploadUrl: string }>>;
  public resumeFromPreviousUpload: (resumable: { uploadUrl: string }) => void;

  constructor(_file: File, _options: Record<string, unknown> = {}) {
    this.start = () => undefined;
    this.abort = async () => undefined;
    this.findPreviousUploads = async () => [];
    this.resumeFromPreviousUpload = () => undefined;
  }
}

export default { Upload };
