/**
 * Resolves a FileSystemDirectoryHandle to a displayable path string.
 * 
 * Tries to use chrome.fileSystem.getDisplayPath() for the full path,
 * falls back to the directory handle's name if that fails.
 * 
 * @param {FileSystemDirectoryHandle} dirHandle - The directory handle from showDirectoryPicker()
 * @param {Object} chromeApi - The chrome API object (injectable for testing)
 * @returns {Promise<string>} The display path or directory name
 */
export async function resolveCwdPath(dirHandle, chromeApi = chrome) {
  const fallbackName = dirHandle.name;

  // Try to get the full display path using chrome.fileSystem API
  if (chromeApi?.fileSystem?.getDisplayPath && typeof dirHandle.getAsEntry === 'function') {
    try {
      const entry = dirHandle.getAsEntry();
      
      // chrome.fileSystem.getDisplayPath can use either callbacks or promises
      // depending on the Chrome version. We handle both.
      const path = await new Promise((resolve) => {
        let resolved = false;
        
        const handleResult = (result) => {
          if (!resolved) {
            resolved = true;
            resolve(result || null);
          }
        };
        
        const result = chromeApi.fileSystem.getDisplayPath(entry, handleResult);
        
        // If it also returns a Promise (Manifest V3 style), use it as well
        if (result instanceof Promise) {
          result.then(handleResult).catch(() => {
            if (!resolved) resolve(null);
          });
        }
        
        // Timeout after 2 seconds if neither callback nor promise resolves
        setTimeout(() => {
          if (!resolved) resolve(null);
        }, 2000);
      });
      if (path) return path;
    } catch {
      // getDisplayPath failed, fall through to fallback
    }
  }

  // Fallback: use the directory name
  return fallbackName;
}
