import { useState, useEffect, useCallback } from 'react';

export default function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const goOnline = useCallback(() => setIsOnline(true), []);
  const goOffline = useCallback(() => setIsOnline(false), []);

  useEffect(() => {
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [goOnline, goOffline]);

  return isOnline;
}
