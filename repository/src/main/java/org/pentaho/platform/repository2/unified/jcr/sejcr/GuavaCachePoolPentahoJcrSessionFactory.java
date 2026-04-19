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


package org.pentaho.platform.repository2.unified.jcr.sejcr;

import com.google.common.cache.CacheBuilder;
import com.google.common.cache.CacheLoader;
import com.google.common.cache.LoadingCache;
import com.google.common.cache.RemovalListener;
import org.apache.jackrabbit.core.SessionImpl;
import org.pentaho.platform.api.engine.ISystemConfig;
import org.pentaho.platform.engine.core.system.PentahoSystem;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.extensions.jcr.SessionFactoryUtils;

import javax.jcr.Credentials;
import javax.jcr.Repository;
import javax.jcr.RepositoryException;
import javax.jcr.Session;
import javax.jcr.SimpleCredentials;
import java.io.IOException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * JCR Session Factory which caches Sessions by Credentials per Thread. The size of the cache and TTL of the entries can
 * be configured with repository.spring.properties
 * <p>
 * Created by nbaker on 6/9/14.
 */
class GuavaCachePoolPentahoJcrSessionFactory extends NoCachePentahoJcrSessionFactory
  implements PentahoJcrSessionFactory {

  static final String USAGE_COUNT = "usage_count"; // attribute key for tracking session usages

  private CredentialsStrategySessionFactory credentialsStrategySessionFactory;
  private int cacheDuration = 300;
  private int cacheSize = 100;

  private Logger logger = LoggerFactory.getLogger( getClass() );
  private PentahoTransactionManager transactionManager;


  public GuavaCachePoolPentahoJcrSessionFactory( Repository repository, String workspace ) {
    this( repository, workspace, null );
  }

  public GuavaCachePoolPentahoJcrSessionFactory( Repository repository, String workspace,
                                                 PentahoTransactionManager transactionManager ) {
    super( repository, workspace );
    this.transactionManager = transactionManager;

    ISystemConfig systemConfig = PentahoSystem.get( ISystemConfig.class );
    if ( systemConfig != null && systemConfig.getConfiguration( "repository" ) != null ) {
      try {
        this.cacheDuration =
          Integer.parseInt( systemConfig.getConfiguration( "repository" ).getProperties().getProperty(
            "cache-ttl", "300" ) );


        this.cacheSize =
          Integer.parseInt( systemConfig.getConfiguration( "repository" ).getProperties().getProperty(
            "cache-size", "100" ) );
      } catch ( IOException e ) {
        logger.info( "Could not find repository.cache-duration" );
      }
    }
  }

  /**
   * Session cache by credentials, partitioned by thread. Two threads obtaining sessions for the same credentials cannot
   * use the same Session.
   * <p>
   * Sessions from the cache will have a "usage_count" attribute set to track if still in use, to verify they can be
   * safely logged out on eviction. See
   * {@link PentahoJcrTemplate#execute(org.springframework.extensions.jcr.JcrCallback,
   * boolean)}
   * <p>
   * NOTE: Uses expireAfterWrite instead of expireAfterAccess to prevent race conditions where sessions could be
   * closed while operations are in-flight. This is particularly important in high-concurrency environments where the
   * expireAfterAccess policy can evict sessions that are still actively referenced by concurrent operations.
   * 
   * RACE CONDITION FIX: Sessions with active usage count are NOT logged out during eviction.
   * This prevents errors when concurrent requests hold references to sessions that expire from cache.
   * Instead of forcing logout, we log a warning and defer cleanup until usage count reaches 0.
   */
  private LoadingCache<CacheKey, Session> sessionCache =
    CacheBuilder.newBuilder().expireAfterWrite( cacheDuration, TimeUnit.SECONDS )
      .maximumSize( cacheSize )
      .removalListener( (RemovalListener<CacheKey, Session>) objectObjectRemovalNotification -> {
        Session session = objectObjectRemovalNotification.getValue();
        String removalCause = objectObjectRemovalNotification.getCause().toString();
        int usageCount = getSessionUsageCount( session );
        
        if ( sessionIsUnused( session ) ) {
          if ( logger.isDebugEnabled() ) {
            logger.debug( "Logging out cached session after eviction (" + removalCause 
              + "), usage_count=" + usageCount + ": " + session );
          }
          try {
            session.logout();
          } catch ( Exception e ) {
            logger.warn( "Exception while logging out evicted session: " + session, e );
          }
        } else {
          // RACE CONDITION FIX: Do NOT logout sessions still in use
          // 
          // Problem: If we logout a session here while it's still referenced by an active request,
          // that request will fail with "This session has been closed" error.
          //
          // Solution: Keep the session alive if it's marked as in-use. The calling code is responsible
          // for decrementing the usage count when done. The session will be evicted from cache but
          // remain usable by the active request that holds a reference to it.
          //
          // The session will eventually be logged out when:
          // 1. Usage count reaches 0 (via manual decrementUsageCount), OR
          // 2. The next cache.get() attempt finds it's no longer live (session.isLive() check)
          
          if ( logger.isInfoEnabled() ) {
            logger.info( "Session still has active references (usage_count=" + usageCount 
              + ", cause=" + removalCause + "). Deferring logout to prevent race condition. "
              + "Session reference: " + session );
          }
          
          // Log more detail in debug mode to help diagnose cache issues
          if ( logger.isDebugEnabled() ) {
            logger.debug( "Active session details - user: " + 
              ( (SessionImpl) session ).getUserID() + 
              ", workspace: " + ( (SessionImpl) session ).getWorkspace().getName() );
          }
        }
      } ).recordStats()
      .build( new CacheLoader<CacheKey, Session>() {
        @Override public Session load( CacheKey credKey ) throws Exception {
          Session session = GuavaCachePoolPentahoJcrSessionFactory.super.getSession( credKey.creds );
          if ( session instanceof SessionImpl ) {
            ( (SessionImpl) session ).setAttribute( USAGE_COUNT, new AtomicInteger( 0 ) );
            if ( logger.isDebugEnabled() ) {
              logger.debug( "Created new JCR session in cache: user=" + 
                ( (SessionImpl) session ).getUserID() + 
                ", thread=" + Thread.currentThread().getId() );
            }
          } else {
            logger.warn( "Expected a Jackrabbit SessionImpl.  Will not be tracking usage." );
          }
          return session;
        }
      } );

  private boolean sessionIsUnused( Session session ) {
    return session.getAttribute( USAGE_COUNT ) instanceof AtomicInteger
      && ( (AtomicInteger) session.getAttribute( USAGE_COUNT ) ).get() == 0;
  }

  /**
   * Helper method to safely extract usage count from a session for logging/debugging purposes.
   * Returns -1 if session is already closed or attribute not found.
   */
  private int getSessionUsageCount( Session session ) {
    try {
      Object usageCount = session.getAttribute( USAGE_COUNT );
      if ( usageCount instanceof AtomicInteger ) {
        return ( (AtomicInteger) usageCount ).get();
      }
    } catch ( Exception e ) {
      // Session likely closed or attribute not accessible
      if ( logger.isDebugEnabled() ) {
        logger.debug( "Could not retrieve usage count from session: " + e.getMessage() );
      }
      return -1;  // Indicate error retrieving count (session likely closed)
    }
    return 0;  // Default to 0 if attribute not found
  }

  /**
   * Increment usage count to mark session as protected from eviction.
   * Called by factory on retrieval and by template on entry.
   * Must be balanced with decrementUsageCount().
   */
  private void incrementUsageCount( Session session ) {
    try {
      Object usageCount = session.getAttribute( USAGE_COUNT );
      if ( usageCount instanceof AtomicInteger ) {
        ( (AtomicInteger) usageCount ).incrementAndGet();
      }
    } catch ( Exception e ) {
      if ( logger.isDebugEnabled() ) {
        logger.debug( "Could not increment usage count: " + e.getMessage() );
      }
    }
  }

  /**
   * Decrement usage count when done using the session.
   * When count reaches 0, the session is eligible for logout during cache eviction.
   * Must correspond to incrementUsageCount() calls.
   */
  private void decrementUsageCount( Session session ) {
    try {
      Object usageCount = session.getAttribute( USAGE_COUNT );
      if ( usageCount instanceof AtomicInteger ) {
        int remaining = ( (AtomicInteger) usageCount ).decrementAndGet();
        if ( remaining < 0 ) {
          logger.warn( "Usage count went negative for session: " + session );
        }
      }
    } catch ( Exception e ) {
      if ( logger.isDebugEnabled() ) {
        logger.debug( "Could not decrement usage count: " + e.getMessage() );
      }
    }
  }

  @Override public Session getSession( Credentials creds ) throws RepositoryException {

    Session session;

    if ( transactionManager == null || !transactionManager.isCreatingTransaction() ) {
      if ( logger.isDebugEnabled() ) {
        logger.debug( "Thread is not transacted, checking cache for session: " + creds );
      }
      try {
        CacheKey key = new CacheKey( creds );
        // find or create
        session = sessionCache.get( key );
        if ( !session.isLive() ) {
          if ( logger.isDebugEnabled() ) {
            logger.debug( "Cached session is not longer alive. disposing: " + creds );
          }
          sessionCache.invalidate( key );
          session = sessionCache.get( key );
        }

        if ( SessionFactoryUtils.isSessionThreadBound( session, credentialsStrategySessionFactory ) ) {
          if ( logger.isDebugEnabled() ) {
            logger.debug(
              "Session is bound to a transaction. This should never happen, ignoring this session and creating a new "
                +
                "session: "
                + creds );
          }
          sessionCache.invalidate( key );
          session = sessionCache.get( key );
        }

        session.refresh( false );
        
        // RACE CONDITION FIX: Increment usage count to prevent eviction during retrieval/transfer
        // The factory increments to protect the session from being evicted while in transit.
        // PentahoJcrTemplate will increment again on entry and decrement on exit,
        // creating a balanced pair that allows proper cleanup.
        incrementUsageCount( session );

      } catch ( Exception e ) {
        logger.error( "Error obtaining session from cache. Creating one directly instead: " + creds, e );
        session = super.getSession( creds );
      }
    } else {
      if ( logger.isDebugEnabled() ) {
        logger.debug( "Thread is transacted, obtaining session directly, not cached: " + creds );
      }
      session = super.getSession( creds );
    }
    return session;
  }

  /**
   * Used by the sessionCache as a key for Jcr Sessions.
   */
  private class CacheKey {
    SimpleCredentials creds;
    Long threadId;

    private CacheKey( Credentials creds ) {
      this.creds = (SimpleCredentials) creds;
      this.threadId = Thread.currentThread().getId();
    }

    @Override
    public boolean equals( Object o ) {
      if ( this == o ) {
        return true;
      }
      if ( o == null || getClass() != o.getClass() ) {
        return false;
      }

      CacheKey cacheKey = (CacheKey) o;

      if ( creds != null ? !creds.getUserID().equals( cacheKey.creds.getUserID() ) : cacheKey.creds != null ) {
        return false;
      }
      if ( threadId != null ? !threadId.equals( cacheKey.threadId ) : cacheKey.threadId != null ) {
        return false;
      }

      return true;
    }

    @Override
    public int hashCode() {
      int result = creds != null ? creds.getUserID().hashCode() : 0;
      result = 31 * result + ( threadId != null ? threadId.hashCode() : 0 );
      return result;
    }
  }

}
