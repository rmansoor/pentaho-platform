import type { Catalog } from '..';
import { common } from './common';
import { shell } from './shell';
import { files } from './files';
import { home } from './home';
import { schedules } from './schedules';
import { datasources } from './datasources';
import { admin } from './admin';

/** Deutsch. Must mirror the English catalog key for key (the Catalog type checks it). */
export const de: Catalog = { common, shell, files, home, schedules, datasources, admin };
