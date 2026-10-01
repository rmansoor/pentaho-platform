/*
 * Compile-time stand-in for java.security.acl.Group, removed from the JDK in Java 14.
 *
 * Only the server-side Jackrabbit (JCR) security classes use it, and Jackrabbit 2.16 itself is built on it.
 * They are compiled against this stub (javac --patch-module) and keep referencing the JDK type, exactly as the
 * Java 8 build did; the stub is not packaged. The PDI client never loads those classes (it ships no JCR).
 */
package java.security.acl;

import java.security.Principal;
import java.util.Enumeration;

public interface Group extends Principal {
  boolean addMember( Principal user );

  boolean removeMember( Principal user );

  boolean isMember( Principal member );

  Enumeration<? extends Principal> members();
}
