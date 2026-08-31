import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type PickFolderResult =
  { ok: true; path: string } | { ok: false; reason: "cancelled" | "unavailable" };

export type ExecFolderPicker = (
  file: string,
  args: readonly string[],
) => Promise<{ stdout: string; stderr: string }>;

const PROMPT = "Choose a learning project folder";

// Vista+ IFileDialog + FOS_PICKFOLDERS via OpenFileDialog, not FolderBrowserDialog.
const WINDOWS_PICK_FOLDER = `
$AssemblyFullName = 'System.Windows.Forms, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089'
$Assembly = [System.Reflection.Assembly]::Load($AssemblyFullName)
$OpenFileDialog = New-Object System.Windows.Forms.OpenFileDialog
$OpenFileDialog.AddExtension = $false
$OpenFileDialog.CheckFileExists = $false
$OpenFileDialog.DereferenceLinks = $true
$OpenFileDialog.Filter = "Folders|\`n"
$OpenFileDialog.Multiselect = $false
$OpenFileDialog.Title = "${PROMPT}"
$OpenFileDialogType = $OpenFileDialog.GetType()
$FileDialogInterfaceType = $Assembly.GetType('System.Windows.Forms.FileDialogNative+IFileDialog')
$IFileDialog = $OpenFileDialogType.GetMethod('CreateVistaDialog',@('NonPublic','Public','Static','Instance')).Invoke($OpenFileDialog,$null)
$null = $OpenFileDialogType.GetMethod('OnBeforeVistaDialog',@('NonPublic','Public','Static','Instance')).Invoke($OpenFileDialog,$IFileDialog)
[uint32]$PickFoldersOption = $Assembly.GetType('System.Windows.Forms.FileDialogNative+FOS').GetField('FOS_PICKFOLDERS').GetValue($null)
$FolderOptions = $OpenFileDialogType.GetMethod('get_Options',@('NonPublic','Public','Static','Instance')).Invoke($OpenFileDialog,$null) -bor $PickFoldersOption
$null = $FileDialogInterfaceType.GetMethod('SetOptions',@('NonPublic','Public','Static','Instance')).Invoke($IFileDialog,$FolderOptions)
$VistaDialogEvent = [System.Activator]::CreateInstance($AssemblyFullName,'System.Windows.Forms.FileDialog+VistaDialogEvents',$false,0,$null,$OpenFileDialog,$null,$null).Unwrap()
[uint32]$AdviceCookie = 0
$AdvisoryParameters = @($VistaDialogEvent,$AdviceCookie)
$null = $FileDialogInterfaceType.GetMethod('Advise',@('NonPublic','Public','Static','Instance')).Invoke($IFileDialog,$AdvisoryParameters)
$AdviceCookie = $AdvisoryParameters[1]
$Result = $FileDialogInterfaceType.GetMethod('Show',@('NonPublic','Public','Static','Instance')).Invoke($IFileDialog,[System.IntPtr]::Zero)
$null = $FileDialogInterfaceType.GetMethod('Unadvise',@('NonPublic','Public','Static','Instance')).Invoke($IFileDialog,$AdviceCookie)
if ($Result -eq [System.Windows.Forms.DialogResult]::OK) {
  Write-Output $OpenFileDialog.FileName
}
`.trim();

export function normalizePickedPath(raw: string): string {
  const trimmed = raw.replace(/^\uFEFF/, "").trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed === "/") {
    return "/";
  }
  if (/^[A-Za-z]:\\$/.test(trimmed)) {
    return trimmed;
  }
  return trimmed.replace(/[/\\]+$/, "");
}

function execErrorCode(error: unknown): string | number | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  const code = (error as { code?: string | number }).code;
  return typeof code === "string" || typeof code === "number" ? code : undefined;
}

function execErrorText(error: unknown): string {
  if (typeof error !== "object" || error === null) {
    return String(error);
  }
  const record = error as { stderr?: unknown; message?: unknown };
  return `${String(record.stderr ?? "")}\n${String(record.message ?? "")}`;
}

async function defaultExec(
  file: string,
  args: readonly string[],
): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execFileAsync(file, [...args], {
    encoding: "utf8",
  });
  return { stdout, stderr };
}

export async function pickFolderNative(
  platform: NodeJS.Platform = process.platform,
  exec: ExecFolderPicker = defaultExec,
): Promise<PickFolderResult> {
  try {
    if (platform === "darwin") {
      const { stdout } = await exec("osascript", [
        "-e",
        `POSIX path of (choose folder with prompt "${PROMPT}")`,
      ]);
      const picked = normalizePickedPath(stdout);
      if (!picked) {
        return { ok: false, reason: "cancelled" };
      }
      return { ok: true, path: picked };
    }

    if (platform === "win32") {
      const { stdout } = await exec("powershell.exe", [
        "-NoProfile",
        "-STA",
        "-Command",
        WINDOWS_PICK_FOLDER,
      ]);
      const picked = normalizePickedPath(stdout);
      if (!picked) {
        return { ok: false, reason: "cancelled" };
      }
      return { ok: true, path: picked };
    }

    const { stdout } = await exec("zenity", [
      "--file-selection",
      "--directory",
      `--title=${PROMPT}`,
    ]);
    const picked = normalizePickedPath(stdout);
    if (!picked) {
      return { ok: false, reason: "cancelled" };
    }
    return { ok: true, path: picked };
  } catch (error) {
    const code = execErrorCode(error);
    if (code === "ENOENT") {
      return { ok: false, reason: "unavailable" };
    }
    if (code === 1 || /cancel/i.test(execErrorText(error))) {
      return { ok: false, reason: "cancelled" };
    }
    throw error;
  }
}
