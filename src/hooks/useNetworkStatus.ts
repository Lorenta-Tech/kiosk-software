// import { useEffect, useState } from "react";

// export function useNetworkStatus() {
//   const [isOnline, setIsOnline] = useState(navigator.onLine);

//   useEffect(() => {
//     const goOnline  = () => setIsOnline(true);
//     const goOffline = () => setIsOnline(false);
//     window.addEventListener("online",  goOnline);
//     window.addEventListener("offline", goOffline);
//     return () => {
//       window.removeEventListener("online",  goOnline);
//       window.removeEventListener("offline", goOffline);
//     };
//   }, []);

//   return isOnline;
// }

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    // Check immediately on mount
    const check = async () => {
      try {
        const online = await invoke<boolean>("check_internet");
        setIsOnline(online);
      } catch {
        setIsOnline(false);
      }
    };

    check();

    // Then check every 5 seconds
    const interval = setInterval(check, 5000);

    // Also react instantly to browser online/offline events
    const goOnline  = () => check();
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online",  goOnline);
    window.addEventListener("offline", goOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener("online",  goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return isOnline;
}