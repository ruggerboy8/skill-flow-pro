import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const ROUTE_STORAGE_KEY = 'app_last_route';
const EXCLUDED_ROUTES = ['/login', '/auth/callback', '/reset-password', '/forgot-password', '/setup-password'];

/**
 * Persists the current route to sessionStorage and optionally restores it on mount.
 * This helps maintain navigation state across page refreshes.
 */
export function useRoutePersistence() {
  const location = useLocation();
  const navigate = useNavigate();

  // On mount, check if we should restore a previous route
  useEffect(() => {
    const savedRoute = sessionStorage.getItem(ROUTE_STORAGE_KEY);
    
    // Only restore if:
    // 1. We have a saved route
    // 2. Current route is exactly "/" (user landed on home)
    // 3. Saved route is different from home
    // 4. Saved route isn't an auth flow page
    if (
      savedRoute && 
      location.pathname === '/' && 
      savedRoute !== '/' && 
      !EXCLUDED_ROUTES.some(r => savedRoute.startsWith(r))
    ) {
      // Small delay to let the app fully mount
      const timeout = setTimeout(() => {
        navigate(savedRoute, { replace: true });
      }, 100);
      
      return () => clearTimeout(timeout);
    }
  }, []); // Only run on mount

  // Save current route whenever it changes (excluding auth routes)
  useEffect(() => {
    if (!EXCLUDED_ROUTES.some(r => location.pathname.startsWith(r))) {
      sessionStorage.setItem(ROUTE_STORAGE_KEY, location.pathname + location.search);
    }
  }, [location.pathname, location.search]);
}
