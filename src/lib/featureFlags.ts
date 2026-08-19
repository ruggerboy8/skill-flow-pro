// Org-level pro move authoring (create/edit custom moves per org)
// Gated OFF until UI and policies are ready
export const orgLibraryAuthoringEnabled =
  import.meta.env.VITE_ORG_LIBRARY_AUTHORING?.toLowerCase?.() === 'true' || false;
