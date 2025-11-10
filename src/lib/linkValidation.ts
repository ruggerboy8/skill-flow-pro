export function validateLinkUrl(url: string): { valid: boolean; error?: string } {
  if (!url.trim()) {
    return { valid: false, error: 'URL is required' };
  }
  
  if (!url.startsWith('https://')) {
    return { valid: false, error: 'URL must start with https://' };
  }
  
  if (url.length > 200) {
    return { valid: false, error: 'URL must be 200 characters or less' };
  }
  
  try {
    new URL(url);
    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}

export function validateLinkTitle(title: string): { valid: boolean; error?: string } {
  if (title && title.length > 80) {
    return { valid: false, error: 'Title must be 80 characters or less' };
  }
  
  return { valid: true };
}
