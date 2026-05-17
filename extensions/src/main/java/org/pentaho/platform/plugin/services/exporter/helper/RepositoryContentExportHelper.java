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
import org.pentaho.platform.api.repository2.unified.IUnifiedRepository;
import org.pentaho.platform.api.repository2.unified.RepositoryFile;
import org.pentaho.platform.plugin.services.exporter.PentahoPlatformExporter;

/**
 * Export helper for repository content (files and folders).
 * Coordinates repository file export with configuration-based filtering.
 */
public class RepositoryContentExportHelper implements IExportHelper {
  
  private PentahoPlatformExporter exporter;
  private IUnifiedRepository repository;

  public RepositoryContentExportHelper( PentahoPlatformExporter exporter, IUnifiedRepository repository ) {
    this.exporter = exporter;
    this.repository = repository;
  }

  @Override
  public String getName() {
    return "RepositoryContentExporter";
  }

  @Override
  public void doExport( Object exportArg ) throws ExportException {
    // Check if repository content should be exported
    if ( !exporter.getComponentConfig().isIncludeContent() ) {
      exporter.getRepositoryExportLogger().debug( "Skipping repository content export (not included in backup configuration)" );
      return;
    }

    try {
      RepositoryFile rootFolder = repository.getFile( "/" );
      exporter.delegateExportFileContent( rootFolder );
    } catch ( Exception e ) {
      throw new ExportException( "Failed to export repository content: " + e.getMessage(), e );
    }
  }
}
