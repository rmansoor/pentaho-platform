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
 * Export helper for metadata models.
 * Coordinates metadata domain model export with configuration-based filtering.
 */
public class MetadataExportHelper implements IExportHelper {
  private PentahoPlatformExporter exporter;

  public MetadataExportHelper( PentahoPlatformExporter exporter ) {
    this.exporter = exporter;
  }

  @Override
  public String getName() {
    return "MetadataExporter";
  }

  @Override
  public void doExport( Object exportArg ) throws ExportException {
    // Check if metadata should be exported (uses datasources flag)
    if ( !exporter.getComponentConfig().isIncludeDatasources() ) {
      exporter.getRepositoryExportLogger().debug( "Skipping metadata models export (datasources not included in backup configuration)" );
      return;
    }
    try {
      exporter.delegateExportMetadataModels();
    } catch ( Exception e ) {
      throw new ExportException( "Failed to export metadata models: " + e.getMessage(), e );
    }
  }
}
