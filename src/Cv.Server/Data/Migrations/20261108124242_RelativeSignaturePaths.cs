using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Cv.Server.Data.Migrations
{
    /// <summary>
    /// Signature paths used to be stored absolute, which breaks as soon as the data folder moves. A migration rather than a start-up step: it runs exactly
    /// once, in one transaction with its history row, and a restored older backup passes through it on its way to the current schema. It needs no knowledge
    /// of the data folder, because every signature lives directly in <c>signatures/</c>: only the file name of the old value matters.
    /// </summary>
    /// <inheritdoc />
    public partial class RelativeSignaturePaths : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // A Windows path from a backup made there
            migrationBuilder.Sql(@"UPDATE ""cover_letters"" SET ""SignaturePath"" = replace(""SignaturePath"", '\', '/') WHERE ""SignaturePath"" LIKE '%\%';");

            // rtrim(x, <all characters of x except '/'>) leaves everything up to the last '/'
            migrationBuilder.Sql(@"
UPDATE ""cover_letters""
SET ""SignaturePath"" = 'signatures/' || substr(""SignaturePath"", length(rtrim(""SignaturePath"", replace(""SignaturePath"", '/', ''))) + 1)
WHERE ""SignaturePath"" LIKE '/%' OR ""SignaturePath"" LIKE '_:/%';");

            migrationBuilder.Sql(@"UPDATE ""cover_letters"" SET ""SignaturePath"" = NULL WHERE ""SignaturePath"" = 'signatures/';");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // The absolute paths cannot be reconstructed, and relative ones are what the file helper reads
        }
    }
}
