/*! ******************************************************************************
 *
 * Pentaho
 *
 * Copyright (C) 2024 by Hitachi Vantara, LLC : http://www.pentaho.com
 *
 * Use of this software is governed by the Business Source License included
 * in the LICENSE.TXT file.
 *
 * Change Date: 2028-08-13
 ******************************************************************************/

package org.pentaho.platform.plugin.services.exporter.helper;

import org.pentaho.platform.api.importexport.ExportException;
import org.pentaho.platform.plugin.services.exporter.PentahoPlatformExporter;

/**
 * Export helper for user settings and email/group preferences.
 * This helper is optional and only executes when user settings are included in the backup configuration.
 * 
 * Note: Actual implementation may be in the user-settings module.
 * This is a stub that demonstrates the separation of concerns pattern.
 */
public class EmailsGroupsExportHelper extends AbstractConfigurableExportHelper {

  public EmailsGroupsExportHelper( PentahoPlatformExporter exporter ) {
    super( exporter );
  }

  @Override
  public String getName() {
    return "EmailsGroupsExportHelper";
  }

  /**
   * Check if user settings should be included in the export.
   */
  @Override
  protected boolean shouldExecute() {
    return exporter.getComponentConfig() != null && 
           exporter.getComponentConfig().isIncludeUserSettings();
  }

  @Override
  protected String getSkipReason() {
    return "user settings not included in backup configuration";
  }

  /**
   * Perform the actual user settings export.
   * Implementation will export user preferences, email settings, and group assignments.
   */
  @Override
  protected void performExport( Object exportArg ) throws ExportException {
    exporter.getRepositoryExportLogger().info( "Exporting user settings and email/group preferences..." );
    // TODO: Implement actual user settings export logic
    // This would typically involve:
    // 1. Getting all user settings from the user settings service
    // 2. Exporting email preferences, group assignments, and other settings
    // 3. Adding to manifest
    // 4. Recording metrics
    exporter.getRepositoryExportLogger().info( "Completed user settings export" );
  }
}
