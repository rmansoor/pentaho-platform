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
import org.pentaho.platform.api.importexport.IExportHelper;
import org.pentaho.platform.plugin.services.exporter.PentahoPlatformExporter;
import org.pentaho.platform.plugin.services.importexport.BackupComponentConfig;

/**
 * Export helper for JDBC datasources.
 */
public class DatasourcesExportHelper implements IExportHelper {
  private PentahoPlatformExporter exporter;
  private BackupComponentConfig componentConfig;

  public DatasourcesExportHelper( PentahoPlatformExporter exporter ) {
    this.exporter = exporter;
  }

  @Override
  public String getName() {
    return "DatasourcesExporter";
  }

  public boolean shouldExecute( BackupComponentConfig config ) {
    this.componentConfig = config;
    return config != null && config.isIncludeDatasources();
  }

  @Override
  public void doExport( Object exportArg ) throws ExportException {
    if ( !shouldExecute( componentConfig ) ) {
      return;
    }
    try {
      exporter.delegateExportDatasources();
    } catch ( Exception e ) {
      throw new ExportException( "Failed to export datasources: " + e.getMessage(), e );
    }
  }
}
