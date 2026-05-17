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

    exporter.getRepositoryExportLogger().info( Messages.getInstance().getString( "PentahoPlatformExporter.INFO_START_EXPORT_JDBC_DATASOURCE" ) );
    
    int successfulExportJDBCDSCount = 0;
    int failedCount = 0;
    int databaseConnectionsSize = 0;

    try {
      List<IDatabaseConnection> databaseConnections = exporter.getDatasourceMgmtService().getDatasources();
      if ( databaseConnections != null ) {
        databaseConnectionsSize = databaseConnections.size();
        exporter.getRepositoryExportLogger().info( Messages.getInstance().getString( "PentahoPlatformExporter.INFO_COUNT_JDBC_DATASOURCE_TO_EXPORT", databaseConnectionsSize ) );
        if ( exporter.getMetricsCollector() != null ) {
          exporter.getMetricsCollector().addJdbcDatasources( databaseConnectionsSize );
        }
        if ( exporter.getInventoryLogger() != null ) {
          exporter.getInventoryLogger().logComponentStart("Datasources", databaseConnectionsSize);
        }
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
            if ( exporter.getInventoryLogger() != null ) {
              exporter.getInventoryLogger().logObjectSuccess("DATASOURCES", datasource.getName(), "DATASOURCE");
            }
            if ( exporter.getBackupInventory() != null ) {
              exporter.getBackupInventory().recordSuccess("DATASOURCES", datasource.getName(), "DATASOURCE");
            }
          } catch ( Exception e ) {
            failedCount++;
            if ( exporter.getExportMetrics() != null ) {
              exporter.getExportMetrics().recordFailure( ImportExportMetrics.Category.DATASOURCES, datasource.getName(), e );
            }
            if ( exporter.getInventoryLogger() != null ) {
              exporter.getInventoryLogger().logObjectFailure("DATASOURCES", datasource.getName(), "DATASOURCE", e.getMessage());
            }
          }
        }
      }
    } catch ( DatasourceMgmtServiceException e ) {
      exporter.getRepositoryExportLogger().warn( "Unable to retrieve JDBC datasource(s). Cause [" + e.getMessage() + " ]" );
      exporter.getRepositoryExportLogger().debug( "Unable to retrieve JDBC datasource(s). Cause [" + e.getMessage() + " ]", e );
      if ( exporter.getInventoryLogger() != null ) {
        exporter.getInventoryLogger().logObjectFailure("DATASOURCES", "All Datasources", "DATASOURCE_COLLECTION", e.getMessage());
      }
    }

    exporter.getRepositoryExportLogger().info( Messages.getInstance().getString( "PentahoPlatformExporter.INFO_SUCCESSFUL_JDBC_DATASOURCE_EXPORT_COUNT", successfulExportJDBCDSCount, databaseConnectionsSize ) );
    if ( exporter.getMetricsCollector() != null ) {
      exporter.getImportExportLogger().logComponentComplete("Datasources", successfulExportJDBCDSCount, failedCount, 0);
    }
    if ( exporter.getInventoryLogger() != null ) {
      exporter.getInventoryLogger().logComponentComplete("Datasources", "DATASOURCES", successfulExportJDBCDSCount, failedCount, 0);
    }

    exporter.getRepositoryExportLogger().info( Messages.getInstance().getString( "PentahoPlatformExporter.INFO_END_EXPORT_JDBC_DATASOURCE" ) );
  }
}
