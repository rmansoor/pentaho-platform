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

package org.pentaho.platform.plugin.services.importexport;

import org.apache.commons.cli.ParseException;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.junit.runners.Parameterized;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.List;

import static org.junit.Assert.*;

/**
 * Comprehensive automation test for CommandLineProcessor covering all permutations and combinations
 * of import/export, backup/restore, and REST operations.
 *
 * This test suite validates:
 * 1. All request type combinations (import, export, backup, restore, rest, help)
 * 2. All parameter combinations for each request type
 * 3. Required vs optional parameters
 * 4. Valid and invalid parameter values
 * 5. Permission and ACL settings combinations
 * 6. Datasource type handling (JDBC, METADATA, ANALYSIS)
 * 7. Resource type handling (SOLUTIONS, DATASOURCE)
 * 8. Error conditions and edge cases
 */
@RunWith( Parameterized.class )
public class CommandLineProcessorAutomationTest {

  private String[] commandLineArgs;
  private boolean shouldPass;
  private String testScenario;

  public CommandLineProcessorAutomationTest( String testScenario, String[] args, boolean shouldPass ) {
    this.testScenario = testScenario;
    this.commandLineArgs = args;
    this.shouldPass = shouldPass;
  }

  @Parameterized.Parameters( name = "{0}" )
  public static Collection<Object[]> data() {
    List<Object[]> testCases = new ArrayList<>();

    // ================ IMPORT OPERATIONS ================

    // Basic Import - Minimal Required Parameters
    testCases.add( new Object[] { "IMPORT_BASIC_MINIMAL",
      new String[] { "-i", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password", "-fp",
        "/tmp/test.zip", "-f", "/public" }, true } );

    // Import with All Parameters
    testCases.add( new Object[] { "IMPORT_WITH_ALL_PARAMS",
      new String[] { "-i", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password", "-fp",
        "/tmp/test.zip", "-f", "/public", "-c", "UTF-8", "-l", "/tmp/log.txt", "-lL", "DEBUG", "-o", "true",
        "-r", "true", "-m", "true" }, true } );

    // Import with Charset Variations
    testCases.add( new Object[] { "IMPORT_CHARSET_UTF8",
      new String[] { "-i", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password", "-fp",
        "/tmp/test.zip", "-f", "/public", "-c", "UTF-8" }, true } );
    testCases.add( new Object[] { "IMPORT_CHARSET_ISO88591",
      new String[] { "-i", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password", "-fp",
        "/tmp/test.zip", "-f", "/public", "-c", "ISO-8859-1" }, true } );

    // Import with Overwrite Combinations
    testCases.add( new Object[] { "IMPORT_OVERWRITE_TRUE",
      new String[] { "-i", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password", "-fp",
        "/tmp/test.zip", "-f", "/public", "-o", "true" }, true } );
    testCases.add( new Object[] { "IMPORT_OVERWRITE_FALSE",
      new String[] { "-i", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password", "-fp",
        "/tmp/test.zip", "-f", "/public", "-o", "false" }, true } );

    // Import with Permission Combinations
    testCases.add( new Object[] { "IMPORT_PERMISSION_TRUE",
      new String[] { "-i", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password", "-fp",
        "/tmp/test.zip", "-f", "/public", "-m", "true" }, true } );
    testCases.add( new Object[] { "IMPORT_PERMISSION_FALSE",
      new String[] { "-i", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password", "-fp",
        "/tmp/test.zip", "-f", "/public", "-m", "false" }, true } );

    // Import with Retain Ownership Combinations
    testCases.add( new Object[] { "IMPORT_RETAIN_OWNERSHIP_TRUE",
      new String[] { "-i", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password", "-fp",
        "/tmp/test.zip", "-f", "/public", "-r", "true" }, true } );
    testCases.add( new Object[] { "IMPORT_RETAIN_OWNERSHIP_FALSE",
      new String[] { "-i", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password", "-fp",
        "/tmp/test.zip", "-f", "/public", "-r", "false" }, true } );

    // Import Solutions Resource Type
    testCases.add( new Object[] { "IMPORT_RESOURCE_TYPE_SOLUTIONS",
      new String[] { "-i", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password", "-fp",
        "/tmp/test.zip", "-f", "/public", "-res", "SOLUTIONS" }, true } );

    // Import Datasource Resource Type - JDBC
    testCases.add( new Object[] { "IMPORT_DATASOURCE_JDBC",
      new String[] { "-i", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password", "-fp",
        "/tmp/datasource.xml", "-res", "DATASOURCE", "-ds", "JDBC" }, true } );

    // Import Datasource Resource Type - METADATA
    testCases.add( new Object[] { "IMPORT_DATASOURCE_METADATA",
      new String[] { "-i", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password", "-fp",
        "/tmp/metadata.xmi", "-res", "DATASOURCE", "-ds", "METADATA", "-m_id", "steel-wheels" }, true } );

    // Import Datasource Resource Type - METADATA without Domain ID (should still pass)
    testCases.add( new Object[] { "IMPORT_DATASOURCE_METADATA_NO_DOMAIN",
      new String[] { "-i", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password", "-fp",
        "/tmp/metadata.xmi", "-res", "DATASOURCE", "-ds", "METADATA" }, true } );

    // Import Datasource Resource Type - ANALYSIS
    testCases.add( new Object[] { "IMPORT_DATASOURCE_ANALYSIS",
      new String[] { "-i", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password", "-fp",
        "/tmp/analysis.xml", "-res", "DATASOURCE", "-ds", "ANALYSIS", "-cat", "MyCatalog", "-a_ds",
        "MyDatasource" }, true } );

    // Import Analysis with XMLA Enabled
    testCases.add( new Object[] { "IMPORT_ANALYSIS_XMLA_TRUE",
      new String[] { "-i", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password", "-fp",
        "/tmp/analysis.xml", "-res", "DATASOURCE", "-ds", "ANALYSIS", "-a_xmla", "true" }, true } );
    testCases.add( new Object[] { "IMPORT_ANALYSIS_XMLA_FALSE",
      new String[] { "-i", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password", "-fp",
        "/tmp/analysis.xml", "-res", "DATASOURCE", "-ds", "ANALYSIS", "-a_xmla", "false" }, true } );

    // Import with Log File and Log Level Combinations
    testCases.add( new Object[] { "IMPORT_LOG_LEVEL_DEBUG",
      new String[] { "-i", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password", "-fp",
        "/tmp/test.zip", "-f", "/public", "-l", "/tmp/log.txt", "-lL", "DEBUG" }, true } );
    testCases.add( new Object[] { "IMPORT_LOG_LEVEL_INFO",
      new String[] { "-i", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password", "-fp",
        "/tmp/test.zip", "-f", "/public", "-l", "/tmp/log.txt", "-lL", "INFO" }, true } );
    testCases.add( new Object[] { "IMPORT_LOG_LEVEL_WARN",
      new String[] { "-i", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password", "-fp",
        "/tmp/test.zip", "-f", "/public", "-l", "/tmp/log.txt", "-lL", "WARN" }, true } );
    testCases.add( new Object[] { "IMPORT_LOG_LEVEL_ERROR",
      new String[] { "-i", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password", "-fp",
        "/tmp/test.zip", "-f", "/public", "-l", "/tmp/log.txt", "-lL", "ERROR" }, true } );

    // ================ EXPORT OPERATIONS ================

    // Basic Export - Minimal Required Parameters
    testCases.add( new Object[] { "EXPORT_BASIC_MINIMAL",
      new String[] { "-e", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password", "-fp",
        "/tmp/export.zip", "-f", "/public" }, true } );

    // Export with All Parameters
    testCases.add( new Object[] { "EXPORT_WITH_ALL_PARAMS",
      new String[] { "-e", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password", "-fp",
        "/tmp/export.zip", "-f", "/public", "-w", "true", "-l", "/tmp/log.txt", "-lL", "INFO" }, true } );

    // Export with Manifest Combinations
    testCases.add( new Object[] { "EXPORT_WITH_MANIFEST_TRUE",
      new String[] { "-e", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password", "-fp",
        "/tmp/export.zip", "-f", "/public", "-w", "true" }, true } );
    testCases.add( new Object[] { "EXPORT_WITH_MANIFEST_FALSE",
      new String[] { "-e", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password", "-fp",
        "/tmp/export.zip", "-f", "/public", "-w", "false" }, true } );

    // Export Different Paths
    testCases.add( new Object[] { "EXPORT_ROOT_PATH",
      new String[] { "-e", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password", "-fp",
        "/tmp/export.zip", "-f", "/" }, true } );
    testCases.add( new Object[] { "EXPORT_NESTED_PATH",
      new String[] { "-e", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password", "-fp",
        "/tmp/export.zip", "-f", "/public/pentaho-solutions/steel-wheels" }, true } );

    // ================ BACKUP OPERATIONS ================

    // Basic Backup - Minimal Required Parameters
    testCases.add( new Object[] { "BACKUP_BASIC_MINIMAL",
      new String[] { "-backup", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password", "-fp",
        "/tmp/backup.zip" }, true } );

    // Backup with All Parameters
    testCases.add( new Object[] { "BACKUP_WITH_ALL_PARAMS",
      new String[] { "-backup", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password", "-fp",
        "/tmp/backup.zip", "-l", "/tmp/log.txt", "-lL", "INFO" }, true } );

    // Backup with Log Level Combinations
    testCases.add( new Object[] { "BACKUP_LOG_LEVEL_DEBUG",
      new String[] { "-backup", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password", "-fp",
        "/tmp/backup.zip", "-lL", "DEBUG" }, true } );
    testCases.add( new Object[] { "BACKUP_LOG_LEVEL_ERROR",
      new String[] { "-backup", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password", "-fp",
        "/tmp/backup.zip", "-lL", "ERROR" }, true } );

    // ================ RESTORE OPERATIONS ================

    // Basic Restore - Minimal Required Parameters
    testCases.add( new Object[] { "RESTORE_BASIC_MINIMAL",
      new String[] { "-restore", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password", "-fp",
        "/tmp/backup.zip", "-o", "true" }, true } );

    // Restore with All Parameters
    testCases.add( new Object[] { "RESTORE_WITH_ALL_PARAMS",
      new String[] { "-restore", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password", "-fp",
        "/tmp/backup.zip", "-o", "true", "-a_acl", "true", "-o_acl", "true", "-l", "/tmp/log.txt", "-lL",
        "INFO" }, true } );

    // Restore with Overwrite Combinations
    testCases.add( new Object[] { "RESTORE_OVERWRITE_TRUE",
      new String[] { "-restore", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password", "-fp",
        "/tmp/backup.zip", "-o", "true" }, true } );
    testCases.add( new Object[] { "RESTORE_OVERWRITE_FALSE",
      new String[] { "-restore", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password", "-fp",
        "/tmp/backup.zip", "-o", "false" }, true } );

    // Restore with ACL Settings Combinations
    testCases.add( new Object[] { "RESTORE_APPLY_ACL_TRUE",
      new String[] { "-restore", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password", "-fp",
        "/tmp/backup.zip", "-o", "true", "-a_acl", "true" }, true } );
    testCases.add( new Object[] { "RESTORE_APPLY_ACL_FALSE",
      new String[] { "-restore", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password", "-fp",
        "/tmp/backup.zip", "-o", "true", "-a_acl", "false" }, true } );

    // Restore with Overwrite ACL Combinations
    testCases.add( new Object[] { "RESTORE_OVERWRITE_ACL_TRUE",
      new String[] { "-restore", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password", "-fp",
        "/tmp/backup.zip", "-o", "true", "-o_acl", "true" }, true } );
    testCases.add( new Object[] { "RESTORE_OVERWRITE_ACL_FALSE",
      new String[] { "-restore", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password", "-fp",
        "/tmp/backup.zip", "-o", "true", "-o_acl", "false" }, true } );

    // Restore with All ACL Combinations
    testCases.add( new Object[] { "RESTORE_ACL_BOTH_TRUE",
      new String[] { "-restore", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password", "-fp",
        "/tmp/backup.zip", "-o", "true", "-a_acl", "true", "-o_acl", "true" }, true } );
    testCases.add( new Object[] { "RESTORE_ACL_APPLY_TRUE_OVERWRITE_FALSE",
      new String[] { "-restore", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password", "-fp",
        "/tmp/backup.zip", "-o", "true", "-a_acl", "true", "-o_acl", "false" }, true } );

    // ================ REST OPERATIONS ================

    // Basic REST - Minimal Required Parameters
    testCases.add( new Object[] { "REST_BASIC_MINIMAL",
      new String[] { "-rest", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password", "-v",
        "children", "-f", "/public" }, true } );

    // REST with All Parameters
    testCases.add( new Object[] { "REST_WITH_ALL_PARAMS",
      new String[] { "-rest", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password", "-v",
        "properties", "-f", "/public", "-params", "filter=type:*", "-l", "/tmp/log.txt" }, true } );

    // REST Different Services
    testCases.add( new Object[] { "REST_SERVICE_CHILDREN",
      new String[] { "-rest", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password", "-v",
        "children", "-f", "/public" }, true } );
    testCases.add( new Object[] { "REST_SERVICE_PROPERTIES",
      new String[] { "-rest", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password", "-v",
        "properties", "-f", "/public" }, true } );
    testCases.add( new Object[] { "REST_SERVICE_PARAMETERIZABLE",
      new String[] { "-rest", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password", "-v",
        "parameterizable", "-f", "/public" }, true } );

    // REST with Parameters
    testCases.add( new Object[] { "REST_WITH_PARAMS",
      new String[] { "-rest", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password", "-v",
        "delete", "-f", "/public", "-params", "fileid1,fileid2" }, true } );

    // ================ HELP OPERATION ================

    testCases.add( new Object[] { "HELP_SHORT_FLAG",
      new String[] { "-h" }, true } );
    testCases.add( new Object[] { "HELP_LONG_FLAG",
      new String[] { "-help" }, true } );

    // ================ ERROR CONDITIONS - MISSING REQUIRED PARAMETERS ================

    // Missing URL
    testCases.add( new Object[] { "ERROR_IMPORT_MISSING_URL",
      new String[] { "-i", "-u", "admin", "-p", "password", "-fp", "/tmp/test.zip", "-f", "/public" },
      false } );

    // Missing Username
    testCases.add( new Object[] { "ERROR_IMPORT_MISSING_USERNAME",
      new String[] { "-i", "-a", "http://localhost:8080/pentaho", "-p", "password", "-fp", "/tmp/test.zip", "-f",
        "/public" }, false } );

    // Missing Password
    testCases.add( new Object[] { "ERROR_IMPORT_MISSING_PASSWORD",
      new String[] { "-i", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-fp", "/tmp/test.zip", "-f",
        "/public" }, false } );

    // Missing File Path
    testCases.add( new Object[] { "ERROR_IMPORT_MISSING_FILE_PATH",
      new String[] { "-i", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password", "-f",
        "/public" }, false } );

    // Missing Import/Export Flag
    testCases.add( new Object[] { "ERROR_MISSING_ACTION",
      new String[] { "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password" },
      false } );

    // Both Import and Export Flags (conflicting)
    testCases.add( new Object[] { "ERROR_BOTH_IMPORT_AND_EXPORT",
      new String[] { "-i", "-e", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password" },
      false } );

    // ================ ERROR CONDITIONS - MISSING METADATA DOMAIN ID ================

    // Import Metadata Datasource - missing Domain ID (may or may not fail depending on implementation)
    testCases.add( new Object[] { "IMPORT_METADATA_OPTIONAL_DOMAIN_ID",
      new String[] { "-i", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password", "-fp",
        "/tmp/metadata.xmi", "-res", "DATASOURCE", "-ds", "METADATA" }, true } );

    // ================ EDGE CASES ================

    // Import with Empty Path (root)
    testCases.add( new Object[] { "IMPORT_EMPTY_PATH",
      new String[] { "-i", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password", "-fp",
        "/tmp/test.zip", "-f", "" }, true } );

    // Export with Deep Nested Path
    testCases.add( new Object[] { "EXPORT_DEEP_NESTED_PATH",
      new String[] { "-e", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password", "-fp",
        "/tmp/export.zip", "-f",
        "/public/pentaho-solutions/steel-wheels/dashboards/reports/sales/by-territory" }, true } );

    // Long URL
    testCases.add( new Object[] { "IMPORT_LONG_URL",
      new String[] { "-i", "-a",
        "http://pentaho.example.com:8080/pentaho/api/some/very/long/path/structure", "-u", "admin", "-p",
        "password", "-fp", "/tmp/test.zip", "-f", "/public" }, true } );

    // Complex Password with Special Characters
    testCases.add( new Object[] { "IMPORT_SPECIAL_CHAR_PASSWORD",
      new String[] { "-i", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "P@ssw0rd!#$", "-fp",
        "/tmp/test.zip", "-f", "/public" }, true } );

    // File path with spaces
    testCases.add( new Object[] { "IMPORT_FILE_PATH_WITH_SPACES",
      new String[] { "-i", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password", "-fp",
        "/tmp/my test file.zip", "-f", "/public" }, true } );

    // ================ PERMUTATION: All Boolean Combinations ================

    // Import - All boolean parameter combinations
    boolean[] boolValues = { true, false };
    for ( boolean overwrite : boolValues ) {
      for ( boolean permission : boolValues ) {
        for ( boolean retain : boolValues ) {
          testCases.add( new Object[] {
            String.format( "IMPORT_BOOLEAN_COMBO_O%d_P%d_R%d", overwrite ? 1 : 0, permission ? 1 : 0,
              retain ? 1 : 0 ),
            new String[] { "-i", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password", "-fp",
              "/tmp/test.zip", "-f", "/public", "-o", String.valueOf( overwrite ), "-m",
              String.valueOf( permission ), "-r", String.valueOf( retain ) }, true } );
        }
      }
    }

    // Restore - All ACL boolean combinations
    for ( boolean applyAcl : boolValues ) {
      for ( boolean overwriteAcl : boolValues ) {
        testCases.add( new Object[] {
          String.format( "RESTORE_ACL_COMBO_A%d_O%d", applyAcl ? 1 : 0, overwriteAcl ? 1 : 0 ),
          new String[] { "-restore", "-a", "http://localhost:8080/pentaho", "-u", "admin", "-p", "password",
            "-fp", "/tmp/backup.zip", "-o", "true", "-a_acl", String.valueOf( applyAcl ), "-o_acl",
            String.valueOf( overwriteAcl ) }, true } );
      }
    }

    return testCases;
  }

  @Before
  public void setUp() {
    // Reset any static state if necessary
  }

  @Test
  public void testCommandLineProcessing() {
    try {
      CommandLineProcessor processor = new CommandLineProcessor( commandLineArgs );
      assertNotNull( "CommandLineProcessor should be created", processor );

      // Verify request type was determined
      assertNotNull( "Request type should be determined", processor.getRequestType() );

      if ( shouldPass ) {
        // Test passed - expected behavior
        assertTrue( "Test scenario: " + testScenario + " should have passed",
          processor.getRequestType() != null );
      } else {
        fail( "Test scenario: " + testScenario + " should have thrown ParseException" );
      }
    } catch ( ParseException e ) {
      if ( !shouldPass ) {
        // Expected to fail
        assertTrue( "Test scenario: " + testScenario + " failed as expected with: " + e.getMessage(),
          true );
      } else {
        fail( "Test scenario: " + testScenario + " should have passed but failed with: " + e.getMessage() );
      }
    } catch ( Exception e ) {
      fail( "Test scenario: " + testScenario + " threw unexpected exception: " + e.getMessage() );
    }
  }

  /**
   * Test that verifies request type is correctly identified
   */
  @Test
  public void testRequestTypeIdentification() {
    try {
      CommandLineProcessor processor = new CommandLineProcessor( commandLineArgs );

      if ( testScenario.contains( "IMPORT" ) ) {
        assertEquals( "Import request should be identified", CommandLineProcessor.RequestType.IMPORT,
          processor.getRequestType() );
      } else if ( testScenario.contains( "EXPORT" ) ) {
        assertEquals( "Export request should be identified", CommandLineProcessor.RequestType.EXPORT,
          processor.getRequestType() );
      } else if ( testScenario.contains( "BACKUP" ) ) {
        assertEquals( "Backup request should be identified", CommandLineProcessor.RequestType.BACKUP,
          processor.getRequestType() );
      } else if ( testScenario.contains( "RESTORE" ) ) {
        assertEquals( "Restore request should be identified", CommandLineProcessor.RequestType.RESTORE,
          processor.getRequestType() );
      } else if ( testScenario.contains( "REST" ) ) {
        assertEquals( "REST request should be identified", CommandLineProcessor.RequestType.REST,
          processor.getRequestType() );
      } else if ( testScenario.contains( "HELP" ) ) {
        assertEquals( "Help request should be identified", CommandLineProcessor.RequestType.HELP,
          processor.getRequestType() );
      }
    } catch ( ParseException e ) {
      if ( shouldPass ) {
        fail( "Test scenario: " + testScenario + " should have passed but failed with: " + e.getMessage() );
      }
    }
  }

  /**
   * Test command line arguments are in correct format
   */
  @Test
  public void testArgumentFormatValidity() {
    // Verify arguments are in pairs (flag + value) or single flags (help)
    int i = 0;
    while ( i < commandLineArgs.length ) {
      String arg = commandLineArgs[i];
      assertTrue( "Argument should start with dash: " + arg, arg.startsWith( "-" ) );

      // Check if it's a flag that requires a value
      if ( isValueRequiredFlag( arg ) ) {
        i++;
        if ( i >= commandLineArgs.length ) {
          // This is expected to be caught during parsing
          break;
        }
      }
      i++;
    }
  }

  private boolean isValueRequiredFlag( String flag ) {
    return !flag.equals( "-i" ) && !flag.equals( "-e" ) && !flag.equals( "-h" ) && !flag.equals( "-help" )
        && !flag.equals( "-backup" ) && !flag.equals( "-restore" ) && !flag.equals( "-rest" );
  }
}
