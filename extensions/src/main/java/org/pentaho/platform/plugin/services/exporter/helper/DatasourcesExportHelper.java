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

import org.pentaho.database.model.IDatabaseConnection;
import org.pentaho.platform.api.importexport.ExportException;
import org.pentaho.platform.api.importexport.IExportHelper;
import org.pentaho.platform.api.repository.datasource.DatasourceMgmtServiceException;
import org.pentaho.platform.plugin.services.exporter.PentahoPlatformExporter;
import org.pentaho.platform.plugin.services.importexport.DatabaseConnectionConverter;
import org.pentaho.platform.plugin.services.importexport.ImportExportMetrics;
import org.pentaho.platform.plugin.services.messages.Messages;

import java.util.List;

/**
 * Export helper for JDBC datasources.
 * Contains all logic for exporting datasource connections with metrics tracking.
 */
public class DatasourcesExportHelper implements IExportHelper {
  private PentahoPlatformExporter exporter;

  public DatasourcesExportHelper( PentahoPlatformExporter exporter ) {
    this.exporter = exporter;
  }

  @Override
  public String getName() {
    return "DatasourcesExporter";
  }

  @Override
  public void doExport( Object exportArg ) throws ExportException {
    // Check if datasources should be exported
    if ( !exporter.getComponentConfig().isIncludeDatasources() ) {
      exporter.getRepositoryExportLogger().debug( "Skipping datasources export (not included in backup configuration)" );
      return;
    }

    try {
      exporter.getRepositoryExportLogger().info( Messages.getInstance().getString( "PentahoPlatformExporter.INFO_START_EXPORT_JDBC_DATASOURCE" ) );
      int successfulExportJDBCDSCount = 0;
      int failedCount = 0;
      int databaseConnectionsSize = 0;
      
      List<IDatabaseConnection> databaseConnections = exporter.getDatasourceMgmtService().getDatasources();
      if ( databaseConnections != null ) {
        databaseConnectionsSize = databaseConnections.size();
        exporter.getRepositoryExportLogger().info( Messages.getInstance().getString( "PentahoPlatformExporter.INFO_COUNT_JDBC_DATASOURCE_TO_EXPORT", databaseConnectionsSize ) );
      }
      
      for ( IDatabaseConnection datasource : databaseConnections ) {
        if ( datasource instanceof org.pentaho.database.model.DatabaseConnection ) {
          exporter.getRepositoryExportLogger().debug( "Starting to perform backup of datasource [ " + datasource.getName() + " ]" );
          try {
            exporter.getExportManifest().addDatasource( DatabaseConnectionConverter.model2export( datasource ) );
            exporter.getRepositoryExportLogger().debug( "Finished performing backup of datasource [ " + datasource.getName() + " ]" );
            successfulExportJDBCDSCount++;
            if ( exporter.getExportMetrics() != null ) {
              exporter.getExportMetrics().recordSuccess( ImportExportMetrics.Category.DATASOURCES );
            }
          } catch ( Exception e ) {
            failedCount++;
            if ( exporter.getExportMetrics() != null ) {
              exporter.getExportMetrics().recordFailure( ImportExportMetrics.Category.DATASOURCES, datasource.getName(), e );
            }
          }
        }
      }
      
      exporter.getRepositoryExportLogger().info( Messages.getInstance().getString( "PentahoPlatformExporter.INFO_SUCCESSFUL_JDBC_DATASOURCE_EXPORT_COUNT", successfulExportJDBCDSCount, databaseConnectionsSize ) );
      exporter.getRepositoryExportLogger().info( Messages.getInstance().getString( "PentahoPlatformExporter.INFO_END_EXPORT_JDBC_DATASOURCE" ) );
    } catch ( Exception e ) {
      if ( exporter.getExportMetrics() != null ) {
        exporter.getExportMetrics().recordFailure( ImportExportMetrics.Category.DATASOURCES, "datasources", e );
      }
      throw new ExportException( "Failed to export datasources: " + e.getMessage(), e );
    }
  }
}
