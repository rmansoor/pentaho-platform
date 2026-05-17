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
 * Export helper for scheduler jobs and schedules.
 * This helper is optional and only executes when schedules are included in the backup configuration.
 * 
 * Note: Actual implementation may be in the scheduler-plugin module.
 * This is a stub that demonstrates the separation of concerns pattern.
 */
public class SchedulerExportHelper extends AbstractConfigurableExportHelper {

  public SchedulerExportHelper( PentahoPlatformExporter exporter ) {
    super( exporter );
  }

  @Override
  public String getName() {
    return "SchedulerExportHelper";
  }

  /**
   * Check if schedules should be included in the export.
   */
  @Override
  protected boolean shouldExecute() {
    return exporter.getComponentConfig() != null && 
           exporter.getComponentConfig().isIncludeSchedules();
  }

  @Override
  protected String getSkipReason() {
    return "schedules not included in backup configuration";
  }

  /**
   * Perform the actual scheduler export.
   * Implementation will export all scheduled jobs from the scheduler service.
   */
  @Override
  protected void performExport( Object exportArg ) throws ExportException {
    exporter.getRepositoryExportLogger().info( "Exporting schedules..." );
    // TODO: Implement actual scheduler export logic
    // This would typically involve:
    // 1. Getting all jobs from the scheduler service
    // 2. Exporting job definitions and schedule information
    // 3. Adding to manifest
    // 4. Recording metrics
    exporter.getRepositoryExportLogger().info( "Completed schedules export" );
  }
}
