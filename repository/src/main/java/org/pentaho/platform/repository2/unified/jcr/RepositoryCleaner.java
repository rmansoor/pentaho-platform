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


package org.pentaho.platform.repository2.unified.jcr;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.apache.jackrabbit.api.management.DataStoreGarbageCollector;
import org.apache.jackrabbit.core.IPentahoSystemSessionFactory;
import org.apache.jackrabbit.core.RepositoryImpl;
import org.pentaho.platform.engine.core.system.PentahoSystem;

import javax.jcr.Node;
import javax.jcr.NodeIterator;
import javax.jcr.Property;
import javax.jcr.Repository;
import javax.jcr.RepositoryException;
import javax.jcr.Session;
import javax.jcr.Value;
import javax.jcr.version.VersionHistory;



/**
 * This class provides a static method {@linkplain #gc()} for running JCR's GC routine.
 *
 * @author Andrey Khayrutdinov
 */
public class RepositoryCleaner {

  private final Log logger = LogFactory.getLog( RepositoryCleaner.class );
  private static final String JCR_FROZEN_NODE = "jcr:frozenNode";
  private static final String JCR_FROZEN_UUID = "jcr:frozenUuid";
  private static final String JCR_ROOT_VERSION = "jcr:rootVersion";
  private IPentahoSystemSessionFactory systemSessionFactory = new IPentahoSystemSessionFactory.DefaultImpl();

  /**
   * Exists primary for testing
   * @param systemSessionFactory
   */
  public void setSystemSessionFactory( IPentahoSystemSessionFactory systemSessionFactory ) {
    this.systemSessionFactory = systemSessionFactory;
  }

  public synchronized void gc() {
    Repository jcrRepository = PentahoSystem.get( Repository.class, "jcrRepository", null );
    if ( jcrRepository == null ) {
      logger.error( "Cannot obtain JCR repository. Exiting" );
      return;
    }

    if ( !( jcrRepository instanceof RepositoryImpl ) ) {
      logger.error(
          String.format( "Expected RepositoryImpl, but got: [%s]. Exiting", jcrRepository.getClass().getName() ) );
      return;
    }

    final RepositoryImpl repository = (RepositoryImpl) jcrRepository;

    try {
      logger.debug( "Starting Orphaned Version Purge" );
      Session systemSession = systemSessionFactory.create( repository );
      Node node = systemSession.getNode( "/jcr:system/jcr:versionStorage" );
      findVersionNodesAndPurge( node, systemSession );
      systemSession.save();
      logger.debug( "Finished Orphaned Version Purge" );
    } catch ( RepositoryException e ) {
      logger.error( "Error running Orphaned Version purge", e );
    }

    try {
      logger.info( "Creating garbage collector" );
      // JCR's documentation recommends not to use RepositoryImpl.createDataStoreGarbageCollector() and
      // instead invoke RepositoryManager.createDataStoreGarbageCollector()
      // (see it here: http://wiki.apache.org/jackrabbit/DataStore#Data_Store_Garbage_Collection)

      // However, the example from the wiki cannot be applied directly, because
      // RepositoryFactoryImpl accepts only TransientRepository's instances that were created by itself;
      // it creates such instance in "not started" state, and when the instance tries to start, it fails,
      // because Pentaho's JCR repository is already running.

      DataStoreGarbageCollector gc = repository.createDataStoreGarbageCollector();
      try {
        try {
          logger.debug( "Starting marking stage" );
          gc.setPersistenceManagerScan( false );
          
          try {
            long startTime = System.currentTimeMillis();
            logger.info( "GC mark phase starting - scanning all nodes and properties..." );
            
            gc.mark();
            
            long duration = System.currentTimeMillis() - startTime;
            logger.info( "GC mark phase completed successfully in " + duration + "ms - repository appears clean" );
          } catch ( RepositoryException e ) {
            long duration = System.currentTimeMillis() - startTime;
            logger.warn( "GC mark phase failed after " + duration + "ms" );
            
            if ( e.getMessage() != null && e.getMessage().contains( "mark failed to access a property" ) ) {
              logger.warn( "GC mark phase encountered corrupted property. Continuing with recovery...", e );
              
              // Try to extract node path from exception chain for better diagnostics
              String diagnosticInfo = extractDiagnosticInfo( e );
              logger.warn( "Corruption details: " + diagnosticInfo );
              logger.warn( "This indicates repository corruption that should be repaired using jcrCheckUI" );
              logger.warn( "Some orphaned data may remain. Consider running jcrCheckUI scan-properties endpoint" );
            } else {
              throw e;
            }
          }
          
          logger.debug( "Starting sweeping stage" );
          long sweepStart = System.currentTimeMillis();
          int deleted = gc.sweep();
          long sweepDuration = System.currentTimeMillis() - sweepStart;
          logger.info( String.format( "Garbage collecting completed in %dms. %d items were deleted", sweepDuration, deleted ) );
              String diagnosticInfo = extractDiagnosticInfo( e );
            logger.warn( "Corruption details: " + diagnosticInfo );
            logger.warn( "This indicates repository corruption that should be repaired using jcrCheckUI" );
            logger.warn( "Some orphaned data may remain. Consider running jcrCheckUI scan-properties endpoint" );
          } else {
            throw e;
          }
        }
        
  /**
   * Extract diagnostic information from GC mark failure exception
   * Attempts to determine at what depth/node the failure occurred
   */
  private String extractDiagnosticInfo( RepositoryException e ) {
    StringBuilder info = new StringBuilder();
    
    // Add the main error message
    if ( e.getMessage() != null ) {
      info.append( "Error: " ).append( e.getMessage() );
    }
    
    // Try to analyze stack trace depth to understand recursion level
    StackTraceElement[] stackTrace = e.getStackTrace();
    int recurseCount = 0;
    for ( StackTraceElement element : stackTrace ) {
      if ( "recurse".equals( element.getMethodName() ) && 
           "GarbageCollector".equals( element.getClassName().substring( element.getClassName().lastIndexOf( '.' ) + 1 ) ) ) {
        recurseCount++;
      }
    }
    
    if ( recurseCount > 0 ) {
      info.append( " | Recursion depth: " ).append( recurseCount ).append( " (failed while traversing nested nodes)" );
    }
    
    // Check for root cause
    Throwable cause = e.getCause();
    if ( cause != null && cause.getMessage() != null ) {
      info.append( " | Root cause: " ).append( cause.getMessage() );
    }
    
    // If no useful info, provide generic guidance
    if ( info.length() == 0 ) {
      info.append( "Property access failed during mark phase traversal" );
    }
    
    return info.toString();
  }

        logger.debug( "Starting sweeping stage" );
        long sweepStart = System.currentTimeMillis();
        int deleted = gc.sweep();
        long sweepDuration = System.currentTimeMillis() - sweepStart;
        logger.info( String.format( "Garbage collecting completed in %dms. %d items were deleted", sweepDuration, deleted ) );
      } finally {
        gc.close();
      }
    } catch ( RepositoryException e ) {
      logger.error( "Error during garbage collecting", e );
    }

  }

  /**
   * Extract diagnostic information from GC mark failure exception
   * Attempts to determine at what depth/node the failure occurred
   */
  private String extractDiagnosticInfo( RepositoryException e ) {
    StringBuilder info = new StringBuilder();
    
    // Add the main error message
    if ( e.getMessage() != null ) {
      info.append( "Error: " ).append( e.getMessage() );
    }
    
    // Try to analyze stack trace depth to understand recursion level
    StackTraceElement[] stackTrace = e.getStackTrace();
    int recurseCount = 0;
    for ( StackTraceElement element : stackTrace ) {
      if ( "recurse".equals( element.getMethodName() ) && 
           "GarbageCollector".equals( element.getClassName().substring( element.getClassName().lastIndexOf( '.' ) + 1 ) ) ) {
        recurseCount++;
      }
    }
    
    if ( recurseCount > 0 ) {
      info.append( " | Recursion depth: " ).append( recurseCount ).append( " (failed while traversing nested nodes)" );
    }
    
    // Check for root cause
    Throwable cause = e.getCause();
    if ( cause != null && cause.getMessage() != null ) {
      info.append( " | Root cause: " ).append( cause.getMessage() );
    }
    
    // If no useful info, provide generic guidance
    if ( info.length() == 0 ) {
      info.append( "Property access failed during mark phase traversal" );
    }
    
    return info.toString();
  }

  private void findVersionNodesAndPurge( Node node, Session session ) {
    if ( node == null || session == null ) {
      return;
    }
    try {
      if ( node.getName().equals( JCR_FROZEN_NODE ) && node.hasProperty( JCR_FROZEN_UUID ) && !node.getParent()
          .getName().equals( JCR_ROOT_VERSION ) ) {
        // Version Node
        Property property = node.getProperty( JCR_FROZEN_UUID );
        Value uuid = property.getValue();
        Node nodeByIdentifier = null;
        try {
          nodeByIdentifier = session.getNodeByIdentifier( uuid.getString() );
          nodeByIdentifier = session.getNode( nodeByIdentifier.getPath() );
        } catch ( RepositoryException ex ) {
          // ignored this means the node is gone.
        }
        if ( nodeByIdentifier == null ) {
          // node is gone
          logger.info( "Removed orphan version: " + node.getPath() );
          ( (VersionHistory) node.getParent().getParent() ).removeVersion( node.getParent().getName() );
        }
      }
    } catch ( RepositoryException e ) {
      logger.error( "Error purging version nodes. Routine will continue", e );
    }

    NodeIterator nodes = null;
    try {
      nodes = node.getNodes();
    } catch ( RepositoryException e ) {
      logger.error( "Error purging version nodes. Routine will continue", e );
    }

    if ( nodes == null ) {
      return;
    }

    while ( nodes.hasNext() ) {
      findVersionNodesAndPurge( nodes.nextNode(), session );
    }
  }
}
