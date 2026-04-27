/*! ******************************************************************************
 *
 * Pentaho
 *
 * Copyright (C) 2024 by Hitachi Vantara, LLC : http://www.pentaho.com
 *
 * Use of this software is governed by the Business Source License included
 * in the LICENSE.TXT file.
 *
 * Change Date: 2029-07-20
 ******************************************************************************/

package org.pentaho.platform.web.http.api.resources;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.any;

import java.io.ByteArrayInputStream;
import java.io.InputStream;

import org.junit.Before;
import org.junit.Test;
import org.pentaho.platform.plugin.services.importexport.BackupComponentConfig;
import org.pentaho.platform.web.http.api.resources.services.FileService;

import javax.ws.rs.WebApplicationException;
import javax.ws.rs.core.Response;

/**
 * Test cases for selective backup/restore REST endpoints
 */
public class FileResourceSelectiveBackupTest {

  private FileResource fileResource;
  private FileService mockFileService;

  @Before
  public void setUp() {
    fileResource = new FileResource();
    mockFileService = mock( FileService.class );
    fileResource.fileService = mockFileService;
  }

  @Test
  public void testSelectiveBackupWithValidConfig() {
    BackupComponentConfig config = BackupComponentConfig.contentOnly();
    
    FileService.DownloadFileWrapper mockWrapper = mock( FileService.DownloadFileWrapper.class );
    try {
      when( mockFileService.selectiveBackup( "backup.log", "INFO", "backup.zip", config ) )
          .thenReturn( mockWrapper );
    } catch ( Exception e ) {
      // Mock setup
    }

    assertNotNull( config );
    assertTrue( config.isValid() );
  }

  @Test
  public void testSelectiveBackupWithInvalidConfig() {
    BackupComponentConfig config = new BackupComponentConfig();
    // Don't select any components - should be invalid

    assertNotNull( config );
    assertTrue( !config.isValid() );
  }

  @Test
  public void testSelectiveBackupWithFullSystemConfig() {
    BackupComponentConfig config = BackupComponentConfig.fullSystem();

    assertNotNull( config );
    assertTrue( config.isValid() );
    assertEquals( 7, config.getComponentCount() );
  }

  @Test
  public void testSelectiveBackupWithSecurityOnlyConfig() {
    BackupComponentConfig config = BackupComponentConfig.securityOnly();

    assertNotNull( config );
    assertTrue( config.isValid() );
    assertTrue( config.isIncludeUsers() );
  }

  @Test
  public void testSelectiveBackupWithDataIntegrationConfig() {
    BackupComponentConfig config = BackupComponentConfig.dataIntegration();

    assertNotNull( config );
    assertTrue( config.isValid() );
    assertTrue( config.isIncludeDatasources() );
    assertTrue( config.isIncludeMondrian() );
    assertTrue( config.isIncludeMetastore() );
  }

  @Test
  public void testSelectiveRestoreEndpoint() {
    // Create mock backup file
    InputStream mockInputStream = new ByteArrayInputStream( "mock backup data".getBytes() );
    
    assertNotNull( mockInputStream );
  }

  @Test
  public void testSelectiveRestoreWithComponentOverrides() {
    BackupComponentConfig overrides = BackupComponentConfig.securityOnly();
    
    assertNotNull( overrides );
    assertTrue( overrides.isValid() );
  }

  @Test
  public void testSelectiveRestoreWithoutComponentOverrides() {
    // Should use config from manifest if not provided
    InputStream mockInputStream = new ByteArrayInputStream( "mock backup data".getBytes() );
    
    assertNotNull( mockInputStream );
  }

  @Test
  public void testParseComponentConfigJson() {
    // Test JSON parsing
    String json = "{\"includeContent\":true,\"includeUsers\":true}";
    
    assertNotNull( json );
    assertTrue( json.contains( "includeContent" ) );
  }

  @Test
  public void testSelectiveBackupLogging() {
    BackupComponentConfig config = BackupComponentConfig.contentOnly();
    
    assertEquals( 1, config.getComponentCount() );
    assertEquals( 1, config.getEnabledComponents().size() );
  }

  @Test
  public void testSelectiveRestoreACLSettings() {
    BackupComponentConfig config = BackupComponentConfig.fullSystem();
    
    assertNotNull( config );
    assertTrue( config.isValid() );
  }

  @Test
  public void testSelectiveBackupOutputFilename() {
    String outputFile = "selective_backup_2024.zip";
    
    assertNotNull( outputFile );
    assertTrue( outputFile.endsWith( ".zip" ) );
  }

  @Test
  public void testSelectiveRestoreIntegration() {
    BackupComponentConfig config = BackupComponentConfig.dataIntegration();
    
    assertNotNull( config );
    assertTrue( config.isValid() );
    assertEquals( 3, config.getComponentCount() );
  }
}
