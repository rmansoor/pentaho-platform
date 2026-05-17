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

/**
 * Export helper for metastore configuration.
 * Coordinates metastore export with configuration-based filtering.
 */
public class MetastoreExportHelper implements IExportHelper {
  private PentahoPlatformExporter exporter;

  public MetastoreExportHelper( PentahoPlatformExporter exporter ) {
    this.exporter = exporter;
  }

  @Override
  public String getName() {
    return "MetastoreExporter";
  }

  @Override
  public void doExport( Object exportArg ) throws ExportException {
    // Check if metastore should be exported
    if ( !exporter.getComponentConfig().isIncludeMetastore() ) {
      exporter.getRepositoryExportLogger().debug( "Skipping metastore export (not included in backup configuration)" );
      return;
    }
    try {
      exporter.delegateExportMetastore();
    } catch ( Exception e ) {
      throw new ExportException( "Failed to export metastore: " + e.getMessage(), e );
    }
  }
}
