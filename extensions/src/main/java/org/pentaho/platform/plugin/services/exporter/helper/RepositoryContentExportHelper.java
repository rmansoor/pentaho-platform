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
import org.pentaho.platform.plugin.services.importexport.BackupComponentConfig;
import org.pentaho.platform.plugin.services.importexport.ImportExportMetrics;

/**
 * Export helper for repository content (files and folders).
 * Handles conditional export based on backup component configuration.
 */
public class RepositoryContentExportHelper implements IExportHelper {
  
  private PentahoPlatformExporter exporter;
  private IUnifiedRepository repository;
  private BackupComponentConfig componentConfig;

  public RepositoryContentExportHelper( PentahoPlatformExporter exporter, IUnifiedRepository repository ) {
    this.exporter = exporter;
    this.repository = repository;
  }

  @Override
  public String getName() {
    return "RepositoryContentExporter";
  }

  /**
   * Determine if repository content export should be performed.
   */
  public boolean shouldExecute( BackupComponentConfig config ) {
    this.componentConfig = config;
    return config != null && config.isIncludeContent();
  }

  @Override
  public void doExport( Object exportArg ) throws ExportException {
    if ( !shouldExecute( componentConfig ) ) {
      return;
    }

    try {
      RepositoryFile rootFolder = repository.getFile( "/" );
      exporter.delegateExportFileContent( rootFolder );
      if ( exporter.getExportMetrics() != null ) {
        exporter.getExportMetrics().recordSuccess( ImportExportMetrics.Category.FILES );
      }
    } catch ( Exception e ) {
      if ( exporter.getExportMetrics() != null ) {
        exporter.getExportMetrics().recordFailure( ImportExportMetrics.Category.FILES, "repository", e );
      }
      throw new ExportException( "Failed to export repository content: " + e.getMessage(), e );
    }
  }
}
