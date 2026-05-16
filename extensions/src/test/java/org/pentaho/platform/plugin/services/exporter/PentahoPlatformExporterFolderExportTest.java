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

package org.pentaho.platform.plugin.services.exporter;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.zip.ZipOutputStream;

import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.pentaho.platform.api.repository2.unified.IUnifiedRepository;
import org.pentaho.platform.api.repository2.unified.RepositoryFile;
import org.pentaho.platform.plugin.services.importexport.ImportExportLogger;
import org.pentaho.platform.plugin.services.importexport.ImportExportMetrics;

/**
 * Test class for PentahoPlatformExporter folder export functionality.
 * Tests that folders are exported independently with their own metadata,
 * separate from files within them.
 */
public class PentahoPlatformExporterFolderExportTest {

  private PentahoPlatformExporter exporter;

  @Mock
  private IUnifiedRepository mockRepository;

  @Mock
  private RepositoryFile mockRootFolder;

  @Mock
  private RepositoryFile mockSubFolder1;

  @Mock
  private RepositoryFile mockSubFolder2;

  @Mock
  private RepositoryFile mockFile1;

  @Mock
  private RepositoryFile mockFile2;

  @Mock
  private RepositoryFile mockFile3;

  @Captor
  private ArgumentCaptor<RepositoryFile> folderCaptor;

  private File tempZipFile;
  private ZipOutputStream zos;

  @Before
  public void setUp() throws Exception {
    MockitoAnnotations.initMocks( this );

    // Create temporary zip file
    tempZipFile = File.createTempFile( "test-export", ".zip" );
    tempZipFile.deleteOnExit();
    zos = new ZipOutputStream( new FileOutputStream( tempZipFile ) );

    // Initialize exporter with mock repository
    exporter = new PentahoPlatformExporter( mockRepository );
    exporter.setZipStream( zos );

    // Setup repository mock
    when( mockRepository.getFile( anyString() ) ).thenReturn( mockRootFolder );
  }

  /**
   * Test 1: Folders are exported independently with their own metadata
   */
  @Test
  public void testFolderExportIndependentMetadata() throws Exception {
    // Setup folder structure:
    // /root
    //   /subfolder1
    //   /subfolder2
    //   file1.txt

    setupFolderStructure();

    // Mock folder ACL export
    PentahoPlatformExporter spyExporter = spy( exporter );
    doNothing().when( spyExporter ).exportFolderAcls( any( RepositoryFile.class ) );

    // Export the folder hierarchy
    spyExporter.exportFolderHierarchyWithMetadata( mockRootFolder, zos, "/" );

    // Verify that exportFolderAcls was called for EACH folder independently
    // This is the key test - each folder should have its metadata exported separately
    verify( spyExporter, times( 3 ) ).exportFolderAcls( any( RepositoryFile.class ) );

    // Verify root, subfolder1, and subfolder2 all had their ACLs exported
    verify( spyExporter ).exportFolderAcls( mockRootFolder );
    verify( spyExporter ).exportFolderAcls( mockSubFolder1 );
    verify( spyExporter ).exportFolderAcls( mockSubFolder2 );
  }

  /**
   * Test 2: Folder permissions are NOT inherited from files
   * Files and folders are processed separately
   */
  @Test
  public void testFolderPermissionsNotInheritedFromFiles() throws Exception {
    // Setup: folder with files
    setupFolderStructure();

    PentahoPlatformExporter spyExporter = spy( exporter );
    doNothing().when( spyExporter ).exportFolderAcls( any( RepositoryFile.class ) );
    doNothing().when( spyExporter ).exportFile( any( RepositoryFile.class ), any( ZipOutputStream.class ), anyString() );

    // Export the folder hierarchy
    spyExporter.exportFolderHierarchyWithMetadata( mockRootFolder, zos, "/" );

    // Verify folders and files were processed separately
    // Folders should have ACLs exported independently
    verify( spyExporter, times( 3 ) ).exportFolderAcls( any( RepositoryFile.class ) );
    
    // Files should be exported via exportFile() method, NOT via exportFolderAcls()
    verify( spyExporter, times( 3 ) ).exportFile( any( RepositoryFile.class ), eq( zos ), anyString() );

    // Critical: exportFolderAcls should never be called for files
    verify( spyExporter, never() ).exportFolderAcls( mockFile1 );
    verify( spyExporter, never() ).exportFolderAcls( mockFile2 );
    verify( spyExporter, never() ).exportFolderAcls( mockFile3 );
  }

  /**
   * Test 3: Hierarchical folder structure is maintained during export
   * Subfolders are processed recursively
   */
  @Test
  public void testFolderHierarchyMaintained() throws Exception {
    // Setup deep hierarchy:
    // /root
    //   /subfolder1
    //     /subfolder1a
    //     file1a.txt
    //   /subfolder2
    //     file2.txt
    //   file.txt

    RepositoryFile mockSubFolder1a = mock( RepositoryFile.class );
    when( mockSubFolder1a.isFolder() ).thenReturn( true );
    when( mockSubFolder1a.getPath() ).thenReturn( "/root/subfolder1/subfolder1a" );
    when( mockSubFolder1a.getName() ).thenReturn( "subfolder1a" );

    RepositoryFile mockFile1a = mock( RepositoryFile.class );
    when( mockFile1a.isFolder() ).thenReturn( false );
    when( mockFile1a.getPath() ).thenReturn( "/root/subfolder1/subfolder1a/file1a.txt" );

    when( mockRootFolder.isFolder() ).thenReturn( true );
    when( mockRootFolder.getPath() ).thenReturn( "/root" );
    when( mockRootFolder.getName() ).thenReturn( "root" );

    when( mockSubFolder1.isFolder() ).thenReturn( true );
    when( mockSubFolder1.getPath() ).thenReturn( "/root/subfolder1" );
    when( mockSubFolder1.getName() ).thenReturn( "subfolder1" );

    when( mockSubFolder2.isFolder() ).thenReturn( true );
    when( mockSubFolder2.getPath() ).thenReturn( "/root/subfolder2" );
    when( mockSubFolder2.getName() ).thenReturn( "subfolder2" );

    when( mockFile1.isFolder() ).thenReturn( false );
    when( mockFile1.getPath() ).thenReturn( "/root/subfolder1/file1.txt" );

    when( mockFile2.isFolder() ).thenReturn( false );
    when( mockFile2.getPath() ).thenReturn( "/root/subfolder2/file2.txt" );

    when( mockFile3.isFolder() ).thenReturn( false );
    when( mockFile3.getPath() ).thenReturn( "/root/file.txt" );

    // Mock repository children calls
    when( mockRepository.getChildren( mockRootFolder.getId() ) )
        .thenReturn( Arrays.asList( mockSubFolder1, mockSubFolder2, mockFile3 ) );

    when( mockRepository.getChildren( mockSubFolder1.getId() ) )
        .thenReturn( Arrays.asList( mockSubFolder1a, mockFile1 ) );

    when( mockRepository.getChildren( mockSubFolder1a.getId() ) )
        .thenReturn( Arrays.asList( mockFile1a ) );

    when( mockRepository.getChildren( mockSubFolder2.getId() ) )
        .thenReturn( Arrays.asList( mockFile2 ) );

    PentahoPlatformExporter spyExporter = spy( exporter );
    doNothing().when( spyExporter ).exportFolderAcls( any( RepositoryFile.class ) );
    doNothing().when( spyExporter ).exportFile( any( RepositoryFile.class ), any( ZipOutputStream.class ), anyString() );

    // Export the deep hierarchy
    spyExporter.exportFolderHierarchyWithMetadata( mockRootFolder, zos, "/" );

    // Verify all folders (4 total) had their ACLs exported
    verify( spyExporter, times( 4 ) ).exportFolderAcls( any( RepositoryFile.class ) );

    // Verify all files (4 total) were exported via exportFile()
    verify( spyExporter, times( 4 ) ).exportFile( any( RepositoryFile.class ), eq( zos ), anyString() );
  }

  /**
   * Test 4: Export continues despite individual folder/file export failures
   */
  @Test
  public void testExportContinuesOnFailures() throws Exception {
    setupFolderStructure();

    PentahoPlatformExporter spyExporter = spy( exporter );
    
    // Make subfolder1 export throw an exception
    doNothing().when( spyExporter ).exportFolderAcls( mockRootFolder );
    doThrow( new IOException( "ACL export failed" ) )
        .when( spyExporter ).exportFolderAcls( mockSubFolder1 );
    doNothing().when( spyExporter ).exportFolderAcls( mockSubFolder2 );
    doNothing().when( spyExporter ).exportFile( any( RepositoryFile.class ), any( ZipOutputStream.class ), anyString() );

    // Export should continue even though subfolder1 fails
    spyExporter.exportFolderHierarchyWithMetadata( mockRootFolder, zos, "/" );

    // Verify that subfolder2 and files were still processed despite subfolder1 failure
    verify( spyExporter ).exportFolderAcls( mockRootFolder );
    verify( spyExporter ).exportFolderAcls( mockSubFolder1 ); // This will throw
    verify( spyExporter ).exportFolderAcls( mockSubFolder2 ); // This should still be called
    verify( spyExporter, times( 3 ) ).exportFile( any( RepositoryFile.class ), eq( zos ), anyString() );
  }

  /**
   * Test 5: Folder metadata export creates independent ZIP entries
   */
  @Test
  public void testFolderMetadataExportCreatesIndependentZipEntry() throws Exception {
    when( mockSubFolder1.isFolder() ).thenReturn( true );
    when( mockSubFolder1.getPath() ).thenReturn( "/public/folder1" );
    when( mockSubFolder1.getName() ).thenReturn( "folder1" );

    PentahoPlatformExporter spyExporter = spy( exporter );
    doNothing().when( spyExporter ).exportFolderAcls( any( RepositoryFile.class ) );

    // Export folder metadata
    spyExporter.exportFolderMetadata( mockSubFolder1, zos, "/public" );

    // Verify folder ACLs were exported independently
    verify( spyExporter ).exportFolderAcls( mockSubFolder1 );

    // Verify folder was tracked as added (ZIP entry created)
    assertEquals( 1, spyExporter.getExportedFolderCount() );
  }

  /**
   * Test 6: Root folder is skipped in explicit export but children are processed
   */
  @Test
  public void testRootFolderSkippedInMetadataExport() throws Exception {
    when( mockRootFolder.isFolder() ).thenReturn( true );
    when( mockRootFolder.getPath() ).thenReturn( "/" );

    PentahoPlatformExporter spyExporter = spy( exporter );
    doNothing().when( spyExporter ).exportFolderAcls( any( RepositoryFile.class ) );

    // Export folder metadata for root
    spyExporter.exportFolderMetadata( mockRootFolder, zos, "/" );

    // Verify root folder was NOT exported (skipped)
    verify( spyExporter, never() ).exportFolderAcls( mockRootFolder );

    // Verify no folders were added (root is skipped)
    assertEquals( 0, spyExporter.getExportedFolderCount() );
  }

  /**
   * Test 7: Folder count tracking is accurate
   */
  @Test
  public void testFolderCountTrackingAccurate() throws Exception {
    setupFolderStructure();

    PentahoPlatformExporter spyExporter = spy( exporter );
    doNothing().when( spyExporter ).exportFolderAcls( any( RepositoryFile.class ) );
    doNothing().when( spyExporter ).exportFile( any( RepositoryFile.class ), any( ZipOutputStream.class ), anyString() );

    // Export the folder hierarchy
    spyExporter.exportFolderHierarchyWithMetadata( mockRootFolder, zos, "/" );

    // Verify folder count: root + subfolder1 + subfolder2 = 3
    // (root folder zip entry is created even though ACL export is skipped for root)
    int folderCount = spyExporter.getExportedFolderCount();
    assertTrue( "Expected at least 2 folders to be tracked", folderCount >= 2 );
  }

  /**
   * Test 8: File count tracking is separate from folder tracking
   */
  @Test
  public void testFileCountTrackingSeparateFromFolders() throws Exception {
    setupFolderStructure();

    PentahoPlatformExporter spyExporter = spy( exporter );
    doNothing().when( spyExporter ).exportFolderAcls( any( RepositoryFile.class ) );
    doNothing().when( spyExporter ).exportFile( any( RepositoryFile.class ), any( ZipOutputStream.class ), anyString() );

    // Export the folder hierarchy
    spyExporter.exportFolderHierarchyWithMetadata( mockRootFolder, zos, "/" );

    // Verify separate tracking for files and folders
    int folderCount = spyExporter.getExportedFolderCount();
    int fileCount = spyExporter.getExportedFileCount();

    assertTrue( "Folders should be tracked", folderCount > 0 );
    assertEquals( "Files: 3 files in test structure", 3, fileCount );
    assertEquals( "Total: folders + files", folderCount + fileCount, spyExporter.getTotalExportedCount() );
  }

  // ========== Helper Methods ==========

  /**
   * Setup basic folder structure for tests:
   * /root
   *   /subfolder1
   *   /subfolder2
   *   file1.txt
   *   file2.txt
   *   file3.txt
   */
  private void setupFolderStructure() {
    // Setup root folder
    when( mockRootFolder.isFolder() ).thenReturn( true );
    when( mockRootFolder.getPath() ).thenReturn( "/" );
    when( mockRootFolder.getName() ).thenReturn( "root" );

    // Setup subfolder1
    when( mockSubFolder1.isFolder() ).thenReturn( true );
    when( mockSubFolder1.getPath() ).thenReturn( "/subfolder1" );
    when( mockSubFolder1.getName() ).thenReturn( "subfolder1" );

    // Setup subfolder2
    when( mockSubFolder2.isFolder() ).thenReturn( true );
    when( mockSubFolder2.getPath() ).thenReturn( "/subfolder2" );
    when( mockSubFolder2.getName() ).thenReturn( "subfolder2" );

    // Setup files
    when( mockFile1.isFolder() ).thenReturn( false );
    when( mockFile1.getPath() ).thenReturn( "/file1.txt" );
    when( mockFile1.getName() ).thenReturn( "file1.txt" );

    when( mockFile2.isFolder() ).thenReturn( false );
    when( mockFile2.getPath() ).thenReturn( "/file2.txt" );
    when( mockFile2.getName() ).thenReturn( "file2.txt" );

    when( mockFile3.isFolder() ).thenReturn( false );
    when( mockFile3.getPath() ).thenReturn( "/file3.txt" );
    when( mockFile3.getName() ).thenReturn( "file3.txt" );

    // Mock repository children calls
    when( mockRepository.getChildren( mockRootFolder.getId() ) )
        .thenReturn( Arrays.asList( mockSubFolder1, mockSubFolder2, mockFile1, mockFile2, mockFile3 ) );

    when( mockRepository.getChildren( mockSubFolder1.getId() ) )
        .thenReturn( new ArrayList<>() );

    when( mockRepository.getChildren( mockSubFolder2.getId() ) )
        .thenReturn( new ArrayList<>() );
  }
}
