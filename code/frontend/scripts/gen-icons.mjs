#!/usr/bin/env node
/**
 * Generates src/components/Icon.tsx from Font Awesome Free.
 *
 * The set is a build-time dependency, not a runtime one: this script reads the
 * SVGs out of node_modules and writes their path data inline into a React
 * component. Nothing is fetched at runtime.
 *
 * Why inline rather than loading the files. First, colour: every icon takes the
 * colour of the text beside it through `currentColor`, which only works when
 * the SVG is part of the document, never through an <img>. Second, requests:
 * the site is published as a Walrus Site where each file is a separate resource
 * fetched through a portal, so a shipped icon file is a round trip the inline
 * version does not make. Third, ΜΛΑ-01: icons inside the bundle cannot fail to
 * load and need no CDN.
 *
 * Style. `solid` throughout, with brands for logos. The free set has outline
 * versions of only a handful of these icons, so mixing weights would show. It
 * is also the weight that survives the size: the icons render at 11 to 14
 * pixels, and at that scale a stroke thinner than one device pixel can only be
 * drawn as a grey smear.
 *
 * Run `npm run icons` after changing the list below.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = join(root, 'node_modules', '@fortawesome', 'fontawesome-free');
const outFile = join(root, 'src', 'components', 'Icon.tsx');

/** Icon name as used in the code -> file in the Font Awesome Free set. */
const ICON_LIST = {
  wallet: 'solid/wallet',
  'right-from-bracket': 'solid/right-from-bracket',
  'arrow-right': 'solid/arrow-right',
  'arrow-down': 'solid/arrow-down',
  'magnifying-glass': 'solid/magnifying-glass',
  // shield-check is Pro only; the halved shield is the free stand-in
  'shield-halved': 'solid/shield-halved',
  'circle-info': 'solid/circle-info',
  certificate: 'solid/certificate',
  cubes: 'solid/cubes',
  cube: 'solid/cube',
  coins: 'solid/coins',
  'circle-nodes': 'solid/circle-nodes',
  palette: 'solid/palette',
  'chart-line': 'solid/chart-line',
  'building-columns': 'solid/building-columns',
  'arrow-up-from-bracket': 'solid/arrow-up-from-bracket',
  'file-lines': 'solid/file-lines',
  'arrow-up-right-from-square': 'solid/arrow-up-right-from-square',
  eye: 'solid/eye',
  github: 'brands/github',
  bell: 'solid/bell',
  tag: 'solid/tag',
  xmark: 'solid/xmark',
  'circle-check': 'solid/circle-check',
  'triangle-exclamation': 'solid/triangle-exclamation',
  'circle-xmark': 'solid/circle-xmark',
  'circle-question': 'solid/circle-question',
  lock: 'solid/lock',
  'clock-rotate-left': 'solid/clock-rotate-left',
  clock: 'solid/clock',
  'box-archive': 'solid/box-archive',
  'box-open': 'solid/box-open',
  'cart-shopping': 'solid/cart-shopping',
  image: 'solid/image',
  plus: 'solid/plus',
  'clipboard-list': 'solid/clipboard-list',
  flag: 'solid/flag',
  gavel: 'solid/gavel',
  'satellite-dish': 'solid/satellite-dish',
  sliders: 'solid/sliders',
  user: 'solid/user',
  ban: 'solid/ban',
  inbox: 'solid/inbox',
  'file-shield': 'solid/file-shield',
  'circle-exclamation': 'solid/circle-exclamation',
  'hourglass-half': 'solid/hourglass-half',
  bars: 'solid/bars',
  'graduation-cap': 'solid/graduation-cap',
};

if (!existsSync(pkgDir)) {
  throw new Error('@fortawesome/fontawesome-free is not installed. Run npm install.');
}
const { version } = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));

const entries = Object.entries(ICON_LIST)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([name, source]) => {
    const file = join(pkgDir, 'svgs', `${source}.svg`);
    if (!existsSync(file)) throw new Error(`${name}: ${source}.svg not found in the free set`);
    const svg = readFileSync(file, 'utf8');
    const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1];
    const paths = [...svg.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1]);
    if (!viewBox || paths.length === 0) throw new Error(`${name}: no viewBox or path`);
    return { name, viewBox, d: paths.join(' ') };
  });

const key = (name) => (/^[a-z][a-z0-9]*$/.test(name) ? name : `'${name}'`);

const out = `/**
 * Icon set: Font Awesome Free ${version} by @fontawesome, solid style, brands
 * for logos. Icons licensed CC BY 4.0, https://fontawesome.com/license/free
 *
 * GENERATED FILE. Edit the list in scripts/gen-icons.mjs and run
 * \`npm run icons\`. That file also explains why the path data is inlined
 * instead of the SVGs being served, and why the solid weight is the one that
 * survives at 11 to 14 pixels.
 */
const ICONS = {
${entries.map((e) => `  ${key(e.name)}: { viewBox: ${JSON.stringify(e.viewBox)}, d: ${JSON.stringify(e.d)} },`).join('\n')}
} as const;

export type IconName = keyof typeof ICONS;

// Inline SVG icon, sized in px and coloured by currentColor
export function Icon({
  name,
  size = 14,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  const { viewBox, d } = ICONS[name];
  return (
    <svg
      aria-hidden
      viewBox={viewBox}
      width={size}
      height={size}
      className={className}
      fill="currentColor"
    >
      <path d={d} />
    </svg>
  );
}
`;

writeFileSync(outFile, out, 'utf8');
console.log(`Icon.tsx: ${entries.length} icons from Font Awesome Free ${version}`);
