import { useEffect, useState } from 'react';

export function useViewport() {
  const [vp, setVp] = useState(() => {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1280;
    return { w, mobile: w < 768, tablet: w >= 768 && w < 1024, desktop: w >= 1024 };
  });
  useEffect(() => {
    const onResize = () => {
      const w = window.innerWidth;
      setVp({ w, mobile: w < 768, tablet: w >= 768 && w < 1024, desktop: w >= 1024 });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return vp;
}
