package org.pentaho.platform.plugin.services.importer;

import org.pentaho.platform.plugin.services.importexport.ImportSource;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class ImportState {


  private List<ImportSource.IRepositoryFileBundle> files = new ArrayList<>();
  private boolean isPerformingRestore;

  private boolean partialImport;
  private Map<String, RepositoryFileImportBundle.Builder> cachedImports = new HashMap<>();
  private boolean overwriteFile;

  public boolean isPartialImport() {
    return partialImport;
  }

  public void setPartialImport( boolean partialImport ) {
    this.partialImport = partialImport;
  }


  public Map<String, RepositoryFileImportBundle.Builder> getCachedImports() {
    return cachedImports;
  }

  public void setCachedImports( Map<String, RepositoryFileImportBundle.Builder> cachedImports ) {
    this.cachedImports = cachedImports;
  }

  public boolean isOverwriteFile() {
    return overwriteFile;
  }

  public void setOverwriteFile( boolean overwriteFile ) {
    this.overwriteFile = overwriteFile;
  }

  public List<ImportSource.IRepositoryFileBundle> getFiles() {
    return files;
  }

  public void setFiles( List<ImportSource.IRepositoryFileBundle> files ) {
    this.files = files;
  }

  public boolean isPerformingRestore() {
    return isPerformingRestore;
  }

  public void setPerformingRestore( boolean performingRestore ) {
    isPerformingRestore = performingRestore;
  }


}
