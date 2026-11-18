# Collaborative Comments

One shared collection of comments imported from CSV files and edited collaboratively.

## Language

**Comment**:
A record uniquely identified by id, associated with a post through postId, and containing name, email, and body values.
_Avoid_: Post when referring to a comment

**Shared dataset**:
The application's single collection of accepted comments and their pending alternatives.
_Avoid_: Uploaded file

**Upload**:
A submitted CSV file proposing additions or changed versions of comments. Comments omitted from a file remain untouched.
_Avoid_: Dataset replacement

**Accepted version**:
The current values of a comment shown in ordinary search and listing results.
_Avoid_: Proposed version

**Pending alternative**:
A distinct candidate version of a comment awaiting review against its accepted version and other alternatives.
_Avoid_: Accepted comment

**Pending conflict**:
An unresolved choice among a comment's accepted version and pending alternatives. Its accepted values remain in effect until resolution.
_Avoid_: Invalid record

**Unchanged duplicate**:
An uploaded comment whose ID and values match the accepted comment, requiring no change.
_Avoid_: Conflict

**Active-cell presence**:
A temporary indication of the cell another browser session is editing. It indicates activity, not exclusive ownership.
_Avoid_: Cell lock, shared text editing
