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
 * Export helper for Mondrian OLAP schemas.
 * Coordinates Mondrian catalog export with configuration-based filtering.
 */
public class MondrianExportHelper implements IExportHelper {
  private PentahoPlatformExporter exporter;

  public MondrianExportHelper( PentahoPlatformExporter exporter ) {
    this.exporter = exporter;
  }

  @Override
  public String getName() {
    return "MondrianExporter";
  }

  @Override
  public void doExport( Object exportArg ) throws ExportException {
    // Check if Mondrian schemas should be exported
    if ( !exporter.getComponentConfig().isIncludeMondrian() ) {
      exporter.getRepositoryExportLogger().debug( "Skipping Mondrian schemas export (not included in backup configuration)" );
      return;
    }
    try {
      exporter.delegateExportMondrianSchemas();
    } catch ( Exception e ) {
      throw new ExportException( "Failed to export Mondrian schemas: " + e.getMessage(), e );
    }
  }
}
