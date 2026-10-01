/*!
 *
 * This program is free software; you can redistribute it and/or modify it under the
 * terms of the GNU General Public License, version 2 as published by the Free Software
 * Foundation.
 *
 * You should have received a copy of the GNU General Public License along with this
 * program; if not, you can obtain a copy at http://www.gnu.org/licenses/gpl-2.0.html
 * or from the Free Software Foundation, Inc.,
 * 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU General Public License for more details.
 *
 *
 * Copyright (c) 2002-2018 Hitachi Vantara. All rights reserved.
 *
 */

package org.pentaho.platform.repository2.unified;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Properties;

import org.pentaho.platform.api.locale.IPentahoLocale;
import org.pentaho.platform.api.repository2.unified.IRepositoryFileData;
import org.pentaho.platform.api.repository2.unified.IUnifiedRepository;
import org.pentaho.platform.api.repository2.unified.RepositoryFile;
import org.pentaho.platform.api.repository2.unified.RepositoryFileAce;
import org.pentaho.platform.api.repository2.unified.RepositoryFileAcl;
import org.pentaho.platform.api.repository2.unified.RepositoryFilePermission;
import org.pentaho.platform.api.repository2.unified.RepositoryFileTree;
import org.pentaho.platform.api.repository2.unified.RepositoryRequest;
import org.pentaho.platform.api.repository2.unified.UnifiedRepositoryAccessDeniedException;
import org.pentaho.platform.api.repository2.unified.VersionSummary;
import org.pentaho.platform.repository2.messages.Messages;
import org.springframework.util.Assert;

/**
 * Default implementation of {@link IUnifiedRepository}. Delegates to {@link IRepositoryFileDao} and
 * {@link IRepositoryFileAclDao}.
 * 
 * @author mlowery
 */
public class DefaultUnifiedRepository implements IUnifiedRepository {

  // ~ Static fields/initializers
  // ======================================================================================

  // ~ Instance fields
  // =================================================================================================

  private IRepositoryFileDao repositoryFileDao;

  private IRepositoryFileAclDao repositoryFileAclDao;

  // ~ Constructors
  // ====================================================================================================

  public DefaultUnifiedRepository( final IRepositoryFileDao contentDao, final IRepositoryFileAclDao aclDao ) {
    super();
    Assert.notNull( contentDao, "[Assertion failed] - this argument is required; it must not be null" );
    Assert.notNull( aclDao, "[Assertion failed] - this argument is required; it must not be null" );
    this.repositoryFileDao = contentDao;
    this.repositoryFileAclDao = aclDao;
  }

  // ~ Methods
  // =========================================================================================================

  /**
   * {@inheritDoc}
   */
  public List<RepositoryFileAce> getEffectiveAces( final Serializable fileId ) {
    return getEffectiveAces( fileId, false );
  }

  /**
   * {@inheritDoc}
   */
  public List<RepositoryFileAce> getEffectiveAces( final Serializable fileId, final boolean forceEntriesInheriting ) {
    return repositoryFileAclDao.getEffectiveAces( fileId, forceEntriesInheriting );
  }

  /**
   * {@inheritDoc}
   */
  public boolean hasAccess( final String path, final EnumSet<RepositoryFilePermission> permissions ) {
    return repositoryFileAclDao.hasAccess( path, permissions );
  }

  /**
   * {@inheritDoc}
   */
  public RepositoryFile getFile( final String path ) {
    Assert.hasText( path, "[Assertion failed] - this String argument must have text; it must not be null, empty, or blank" );
    return repositoryFileDao.getFile( path, false );
  }

  /**
   * {@inheritDoc}
   */
  public RepositoryFile getFileById( final Serializable fileId ) {
    Assert.notNull( fileId, "[Assertion failed] - this argument is required; it must not be null" );
    return repositoryFileDao.getFileById( fileId, false );
  }

  /**
   * {@inheritDoc}
   */
  public RepositoryFile getFile( final String path, final boolean loadMaps ) {
    Assert.hasText( path, "[Assertion failed] - this String argument must have text; it must not be null, empty, or blank" );
    return repositoryFileDao.getFile( path, loadMaps );
  }

  /**
   * {@inheritDoc}
   */
  public RepositoryFile getFileById( final Serializable fileId, final boolean loadMaps ) {
    Assert.notNull( fileId, "[Assertion failed] - this argument is required; it must not be null" );
    return repositoryFileDao.getFileById( fileId, loadMaps );
  }

  /**
   * {@inheritDoc}
   */
  @Override
  public RepositoryFile getFile( String path, IPentahoLocale locale ) {
    return this.repositoryFileDao.getFile( path, locale );
  }

  /**
   * {@inheritDoc}
   */
  @Override
  public RepositoryFile getFileById( Serializable fileId, IPentahoLocale locale ) {
    return this.repositoryFileDao.getFileById( fileId, locale );
  }

  /**
   * {@inheritDoc}
   */
  @Override
  public RepositoryFile getFile( String path, boolean loadLocaleMaps, IPentahoLocale locale ) {
    return this.repositoryFileDao.getFile( path, loadLocaleMaps, locale );
  }

  /**
   * {@inheritDoc}
   */
  @Override
  public RepositoryFile getFileById( Serializable fileId, boolean loadLocaleMaps, IPentahoLocale locale ) {
    return this.repositoryFileDao.getFileById( fileId, loadLocaleMaps, locale );
  }

  /**
   * {@inheritDoc}
   */
  public RepositoryFile createFile( final Serializable parentFolderId, final RepositoryFile file,
      final IRepositoryFileData data, final String versionMessage ) {
    return createFile( parentFolderId, file, data, null, versionMessage );
  }

  /**
   * {@inheritDoc}
   */
  public RepositoryFile createFolder( final Serializable parentFolderId, final RepositoryFile file,
      final String versionMessage ) {
    return createFolder( parentFolderId, file, null, versionMessage );
  }

  /**
   * {@inheritDoc}
   */
  public RepositoryFile createFile( final Serializable parentFolderId, final RepositoryFile file,
      final IRepositoryFileData data, final RepositoryFileAcl acl, final String versionMessage ) {
    Assert.notNull( file, "[Assertion failed] - this argument is required; it must not be null" );
    Assert.isTrue( !file.isFolder(), "[Assertion failed] - this expression must be true" );
    Assert.notNull( data, "[Assertion failed] - this argument is required; it must not be null" );
    // external callers never allowed to create files at repo root
    Assert.notNull( parentFolderId, "[Assertion failed] - this argument is required; it must not be null" );
    return internalCreateFile( parentFolderId, file, data, acl, versionMessage );
  }

  /**
   * {@inheritDoc}
   */
  public RepositoryFile createFolder( final Serializable parentFolderId, final RepositoryFile file,
      final RepositoryFileAcl acl, final String versionMessage ) {
    Assert.notNull( file, "[Assertion failed] - this argument is required; it must not be null" );
    Assert.isTrue( file.isFolder(), "[Assertion failed] - this expression must be true" );
    // external callers never allowed to create folders at repo root
    Assert.notNull( parentFolderId, "[Assertion failed] - this argument is required; it must not be null" );
    return internalCreateFolder( parentFolderId, file, acl, versionMessage );
  }

  /**
   * {@inheritDoc}
   * <p/>
   * <p>
   * Delegates to {@link #getStreamForRead(RepositoryFile)} but assumes that some external system (e.g. Spring
   * Security) is protecting this method with different authorization rules than
   * {@link #getStreamForRead(RepositoryFile)}.
   * </p>
   * <p/>
   * <p>
   * In a direct contradiction of the previous paragraph, this implementation is not currently protected by Spring
   * Security.
   * </p>
   * 
   * @see #getDataForRead(RepositoryFile, Class)
   */
  public <T extends IRepositoryFileData> T getDataForExecute( final Serializable fileId, final Class<T> dataClass ) {
    return getDataAtVersionForExecute( fileId, null, dataClass );
  }

  /**
   * {@inheritDoc}
   */
  public <T extends IRepositoryFileData> T getDataAtVersionForExecute( final Serializable fileId,
      final Serializable versionId, final Class<T> dataClass ) {
    return getDataAtVersionForRead( fileId, versionId, dataClass );
  }

  /**
   * {@inheritDoc}
   */
  public <T extends IRepositoryFileData> T getDataForRead( final Serializable fileId, final Class<T> dataClass ) {
    return getDataAtVersionForRead( fileId, null, dataClass );
  }

  /**
   * {@inheritDoc}
   */
  public <T extends IRepositoryFileData> T getDataAtVersionForRead( final Serializable fileId,
      final Serializable versionId, final Class<T> dataClass ) {
    Assert.notNull( fileId, "[Assertion failed] - this argument is required; it must not be null" );
    return repositoryFileDao.getData( fileId, versionId, dataClass );
  }

  /**
   * {@inheritDoc}
   */
  public <T extends IRepositoryFileData> List<T> getDataForReadInBatch( final List<RepositoryFile> files,
      final Class<T> dataClass ) {
    Assert.notNull( files, "[Assertion failed] - this argument is required; it must not be null" );
    List<T> data = new ArrayList<T>( files.size() );
    for ( RepositoryFile f : files ) {
      Assert.notNull( f, "[Assertion failed] - this argument is required; it must not be null" );
      data.add( getDataAtVersionForRead( f.getId(), f.getVersionId(), dataClass ) );
    }
    return data;
  }

  /**
   * {@inheritDoc}
   */
  public <T extends IRepositoryFileData> List<T> getDataForExecuteInBatch( final List<RepositoryFile> files,
      final Class<T> dataClass ) {
    return getDataForReadInBatch( files, dataClass );
  }

  @Override
  public List<RepositoryFile> getChildren( RepositoryRequest repositoryRequest ) {
    return repositoryFileDao.getChildren( repositoryRequest );
  }

  /**
   * {@inheritDoc}
   */
  public List<RepositoryFile> getChildren( final Serializable folderId ) {
    return getChildren( folderId, null, null );
  }

  /**
   * {@inheritDoc}
   */
  public List<RepositoryFile> getChildren( final Serializable folderId, final String filter ) {
    return getChildren( folderId, filter, null );
  }

  /**
   * {@inheritDoc}
   */
  public List<RepositoryFile> getChildren( final Serializable folderId, final String filter, final Boolean showHiddenFiles ) {
    Assert.notNull( folderId, "[Assertion failed] - this argument is required; it must not be null" );
    return repositoryFileDao.getChildren( new RepositoryRequest( folderId.toString(), showHiddenFiles, -1, filter ) );
  }

  /**
   * {@inheritDoc}
   */
  public RepositoryFile updateFile( final RepositoryFile file, final IRepositoryFileData data,
      final String versionMessage ) {
    Assert.notNull( file, "[Assertion failed] - this argument is required; it must not be null" );
    Assert.notNull( data, "[Assertion failed] - this argument is required; it must not be null" );

    return internalUpdateFile( file, data, versionMessage );
  }

  /**
   * {@inheritDoc}
   */
  public void deleteFile( final Serializable fileId, final boolean permanent, final String versionMessage ) {
    Assert.notNull( fileId, "[Assertion failed] - this argument is required; it must not be null" );
    if ( permanent ) {
      // fyi: acl deleted when file node is deleted
      repositoryFileDao.permanentlyDeleteFile( fileId, versionMessage );
    } else {
      repositoryFileDao.deleteFile( fileId, versionMessage );
    }
  }

  /**
   * {@inheritDoc}
   */
  public void deleteFile( final Serializable fileId, final String versionMessage ) {
    deleteFile( fileId, false, versionMessage );
  }

  /**
   * {@inheritDoc}
   */
  public void deleteFileAtVersion( final Serializable fileId, final Serializable versionId ) {
    Assert.notNull( fileId, "[Assertion failed] - this argument is required; it must not be null" );
    Assert.notNull( versionId, "[Assertion failed] - this argument is required; it must not be null" );
    repositoryFileDao.deleteFileAtVersion( fileId, versionId );
  }

  /**
   * {@inheritDoc}
   */
  public List<RepositoryFile> getDeletedFiles( final String origParentFolderPath ) {
    return getDeletedFiles( origParentFolderPath, null );
  }

  /**
   * {@inheritDoc}
   */
  public List<RepositoryFile> getDeletedFiles( final String origParentFolderPath, final String filter ) {
    Assert.hasLength( origParentFolderPath, "[Assertion failed] - this String argument must have length; it must not be null or empty" );
    return repositoryFileDao.getDeletedFiles( origParentFolderPath, filter );
  }

  /**
   * {@inheritDoc}
   */
  public List<RepositoryFile> getDeletedFiles() {
    return repositoryFileDao.getDeletedFiles();
  }

  /**
   * {@inheritDoc}
   */
  public List<RepositoryFile> getAllDeletedFiles() {
    return repositoryFileDao.getAllDeletedFiles();
  }

  /**
   * {@inheritDoc}
   */
  public void undeleteFile( final Serializable fileId, final String versionMessage ) {
    Assert.notNull( fileId, "[Assertion failed] - this argument is required; it must not be null" );
    repositoryFileDao.undeleteFile( fileId, versionMessage );
  }

  /**
   * {@inheritDoc}
   */
  public RepositoryFileAcl getAcl( final Serializable fileId ) {
    Assert.notNull( fileId, "[Assertion failed] - this argument is required; it must not be null" );
    return repositoryFileAclDao.getAcl( fileId );
  }

  /**
   * {@inheritDoc}
   */
  public void lockFile( final Serializable fileId, final String message ) {
    Assert.notNull( fileId, "[Assertion failed] - this argument is required; it must not be null" );
    repositoryFileDao.lockFile( fileId, message );
  }

  /**
   * {@inheritDoc}
   */
  public void unlockFile( final Serializable fileId ) {
    Assert.notNull( fileId, "[Assertion failed] - this argument is required; it must not be null" );
    repositoryFileDao.unlockFile( fileId );
  }

  /**
   * {@inheritDoc}
   */
  public VersionSummary getVersionSummary( Serializable fileId, Serializable versionId ) {
    Assert.notNull( fileId, "[Assertion failed] - this argument is required; it must not be null" );
    return repositoryFileDao.getVersionSummary( fileId, versionId );
  }

  /**
   * {@inheritDoc}
   */
  public List<VersionSummary> getVersionSummaryInBatch( final List<RepositoryFile> files ) {
    Assert.notNull( files, "[Assertion failed] - this argument is required; it must not be null" );
    List<VersionSummary> summaries = new ArrayList<VersionSummary>( files.size() );
    for ( RepositoryFile file : files ) {
      Assert.notNull( file, "[Assertion failed] - this argument is required; it must not be null" );
      summaries.add( getVersionSummary( file.getId(), file.getVersionId() ) );
    }
    return summaries;
  }

  /**
   * {@inheritDoc}
   */
  public List<VersionSummary> getVersionSummaries( final Serializable fileId ) {
    Assert.notNull( fileId, "[Assertion failed] - this argument is required; it must not be null" );
    return repositoryFileDao.getVersionSummaries( fileId );
  }

  /**
   * {@inheritDoc}
   */
  public RepositoryFile getFileAtVersion( final Serializable fileId, final Serializable versionId ) {
    Assert.notNull( fileId, "[Assertion failed] - this argument is required; it must not be null" );
    Assert.notNull( versionId, "[Assertion failed] - this argument is required; it must not be null" );
    return repositoryFileDao.getFile( fileId, versionId );
  }

  /**
   * {@inheritDoc}
   */
  public RepositoryFileAcl updateAcl( final RepositoryFileAcl acl ) {
    Assert.notNull( acl, "[Assertion failed] - this argument is required; it must not be null" );
    RepositoryFile file = getFileById( acl.getId() );
    List<RepositoryFilePermission> perms = new ArrayList<RepositoryFilePermission>();
    perms.add( RepositoryFilePermission.ACL_MANAGEMENT );
    if ( !hasAccess( file.getPath(), EnumSet.copyOf( perms ) ) ) {
      throw new UnifiedRepositoryAccessDeniedException( Messages.getInstance().getString(
          "DefaultUnifiedRepository.ERROR_0001_ACCESS_DENIED_UPDATE_ACL", acl.getId() ) );
    }
    return repositoryFileAclDao.updateAcl( acl );
  }

  /**
   * {@inheritDoc}
   */
  public void moveFile( final Serializable fileId, final String destAbsPath, final String versionMessage ) {
    Assert.notNull( fileId, "[Assertion failed] - this argument is required; it must not be null" );
    Assert.hasText( destAbsPath, "[Assertion failed] - this String argument must have text; it must not be null, empty, or blank" );
    repositoryFileDao.moveFile( fileId, destAbsPath, versionMessage );
  }

  /**
   * {@inheritDoc}
   */
  public void copyFile( final Serializable fileId, final String destAbsPath, final String versionMessage ) {
    Assert.notNull( fileId, "[Assertion failed] - this argument is required; it must not be null" );
    Assert.hasText( destAbsPath, "[Assertion failed] - this String argument must have text; it must not be null, empty, or blank" );
    repositoryFileDao.copyFile( fileId, destAbsPath, versionMessage );
  }

  /**
   * {@inheritDoc}
   */
  public void restoreFileAtVersion( final Serializable fileId, final Serializable versionId, final String versionMessage ) {
    Assert.notNull( fileId, "[Assertion failed] - this argument is required; it must not be null" );
    Assert.notNull( versionId, "[Assertion failed] - this argument is required; it must not be null" );
    repositoryFileDao.restoreFileAtVersion( fileId, versionId, versionMessage );
  }

  /**
   * {@inheritDoc}
   */
  public boolean canUnlockFile( final Serializable fileId ) {
    Assert.notNull( fileId, "[Assertion failed] - this argument is required; it must not be null" );
    return repositoryFileDao.canUnlockFile( fileId );
  }

  /**
   * {@inheritDoc}
   */
  @Override
  public RepositoryFileTree getTree( RepositoryRequest repositoryRequest ) {
    return repositoryFileDao.getTree( repositoryRequest );
  }

  /**
   * @deprecated  Use <code>getTree(RepositoryRequest)</code>
   * 
   * {@inheritDoc}
   */
  @Deprecated
  public RepositoryFileTree getTree( final String path, final int depth, final String filter,
                                     final boolean showHidden ) {
    Assert.hasText( path, "[Assertion failed] - this String argument must have text; it must not be null, empty, or blank" );
    return getTree( new RepositoryRequest( path, showHidden, depth, filter ) );
  }

  private RepositoryFile internalCreateFile( final Serializable parentFolderId, final RepositoryFile file,
      final IRepositoryFileData data, final RepositoryFileAcl acl, final String versionMessage ) {
    Assert.notNull( file, "[Assertion failed] - this argument is required; it must not be null" );
    Assert.notNull( data, "[Assertion failed] - this argument is required; it must not be null" );
    return repositoryFileDao.createFile( parentFolderId, file, data, acl, versionMessage );
  }

  private RepositoryFile internalCreateFolder( final Serializable parentFolderId, final RepositoryFile file,
      final RepositoryFileAcl acl, final String versionMessage ) {
    Assert.notNull( file, "[Assertion failed] - this argument is required; it must not be null" );
    return repositoryFileDao.createFolder( parentFolderId, file, acl, versionMessage );
  }

  private RepositoryFile internalUpdateFolder( final RepositoryFile file, final String versionMessage ) {
    Assert.notNull( file, "[Assertion failed] - this argument is required; it must not be null" );
    return repositoryFileDao.updateFolder( file, versionMessage );
  }

  private RepositoryFile internalUpdateFile( final RepositoryFile file, final IRepositoryFileData data,
      final String versionMessage ) {
    Assert.notNull( file, "[Assertion failed] - this argument is required; it must not be null" );
    Assert.notNull( data, "[Assertion failed] - this argument is required; it must not be null" );
    return repositoryFileDao.updateFile( file, data, versionMessage );
  }

  public List<RepositoryFile> getReferrers( Serializable fileId ) {
    Assert.notNull( fileId, "[Assertion failed] - this argument is required; it must not be null" );
    return repositoryFileDao.getReferrers( fileId );
  }

  public void setFileMetadata( final Serializable fileId, Map<String, Serializable> metadataMap ) {
    Assert.notNull( fileId, "[Assertion failed] - this argument is required; it must not be null" );
    repositoryFileDao.setFileMetadata( fileId, metadataMap );
  }

  public Map<String, Serializable> getFileMetadata( final Serializable fileId ) {
    Assert.notNull( fileId, "[Assertion failed] - this argument is required; it must not be null" );
    return repositoryFileDao.getFileMetadata( fileId );
  }

  public List<Character> getReservedChars() {
    return repositoryFileDao.getReservedChars();
  }

  @Override
  public List<Locale> getAvailableLocalesForFileById( Serializable fileId ) {
    Assert.notNull( fileId, "[Assertion failed] - this argument is required; it must not be null" );
    return repositoryFileDao.getAvailableLocalesForFileById( fileId );
  }

  @Override
  public List<Locale> getAvailableLocalesForFileByPath( String relPath ) {
    Assert.notNull( relPath, "[Assertion failed] - this argument is required; it must not be null" );
    return repositoryFileDao.getAvailableLocalesForFileByPath( relPath );
  }

  @Override
  public List<Locale> getAvailableLocalesForFile( RepositoryFile repositoryFile ) {
    Assert.notNull( repositoryFile, "[Assertion failed] - this argument is required; it must not be null" );
    return repositoryFileDao.getAvailableLocalesForFile( repositoryFile );
  }

  @Override
  public Properties getLocalePropertiesForFileById( Serializable fileId, String locale ) {
    Assert.notNull( fileId, "[Assertion failed] - this argument is required; it must not be null" );
    return repositoryFileDao.getLocalePropertiesForFileById( fileId, locale );
  }

  @Override
  public Properties getLocalePropertiesForFileByPath( String relPath, String locale ) {
    Assert.notNull( relPath, "[Assertion failed] - this argument is required; it must not be null" );
    return repositoryFileDao.getLocalePropertiesForFileByPath( relPath, locale );
  }

  @Override
  public Properties getLocalePropertiesForFile( RepositoryFile repositoryFile, String locale ) {
    Assert.notNull( repositoryFile, "[Assertion failed] - this argument is required; it must not be null" );
    return repositoryFileDao.getLocalePropertiesForFile( repositoryFile, locale );
  }

  @Override
  public void setLocalePropertiesForFileById( Serializable fileId, String locale, Properties properties ) {
    Assert.notNull( fileId, "[Assertion failed] - this argument is required; it must not be null" );
    Assert.notNull( locale, "[Assertion failed] - this argument is required; it must not be null" );
    Assert.notNull( properties, "[Assertion failed] - this argument is required; it must not be null" );
    repositoryFileDao.setLocalePropertiesForFileById( fileId, locale, properties );
  }

  @Override
  public void setLocalePropertiesForFileByPath( String relPath, String locale, Properties properties ) {
    Assert.notNull( relPath, "[Assertion failed] - this argument is required; it must not be null" );
    Assert.notNull( locale, "[Assertion failed] - this argument is required; it must not be null" );
    Assert.notNull( properties, "[Assertion failed] - this argument is required; it must not be null" );
    repositoryFileDao.setLocalePropertiesForFileByPath( relPath, locale, properties );
  }

  @Override
  public void setLocalePropertiesForFile( RepositoryFile repositoryFile, String locale, Properties properties ) {
    Assert.notNull( repositoryFile, "[Assertion failed] - this argument is required; it must not be null" );
    Assert.notNull( locale, "[Assertion failed] - this argument is required; it must not be null" );
    Assert.notNull( properties, "[Assertion failed] - this argument is required; it must not be null" );
    repositoryFileDao.setLocalePropertiesForFile( repositoryFile, locale, properties );
  }

  @Override
  public void deleteLocalePropertiesForFile( RepositoryFile repositoryFile, String locale ) {
    Assert.notNull( repositoryFile, "[Assertion failed] - this argument is required; it must not be null" );
    Assert.notNull( locale, "[Assertion failed] - this argument is required; it must not be null" );
    repositoryFileDao.deleteLocalePropertiesForFile( repositoryFile, locale );
  }

  @Override
  public RepositoryFile updateFolder( RepositoryFile folder, String versionMessage ) {
    Assert.notNull( folder, "[Assertion failed] - this argument is required; it must not be null" );
    return internalUpdateFolder( folder, versionMessage );
  }
}
