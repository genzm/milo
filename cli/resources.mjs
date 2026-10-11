import { loadStyles } from './styles.mjs';
import { loadSlideFonts } from './fonts.mjs';

export async function loadBuildResources() {
  const [styles, fonts] = await Promise.all([loadStyles(), loadSlideFonts()]);
  return { styles, fonts };
}
