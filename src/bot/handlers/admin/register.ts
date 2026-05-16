import { registerContentActions } from './content';
import { registerLessonsActions } from './lessons-admin';
import { registerProductsActions } from './products-admin';
import { registerSettingsActions } from './settings-admin';
import { registerStubActions } from './stubs';
import { registerTeamActions } from './team-admin';

let registered = false;

export function registerAllAdminActions(): void {
  if (registered) return;
  registered = true;
  registerContentActions();
  registerLessonsActions();
  registerProductsActions();
  registerTeamActions();
  registerSettingsActions();
  registerStubActions();
}
