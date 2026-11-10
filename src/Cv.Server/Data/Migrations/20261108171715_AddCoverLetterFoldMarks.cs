using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Cv.Server.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddCoverLetterFoldMarks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IncludeFoldMarks",
                table: "cover_letters",
                type: "INTEGER",
                nullable: false,
                // Existing letters keep printing the marks, as they did before the choice could be saved
                defaultValue: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IncludeFoldMarks",
                table: "cover_letters");
        }
    }
}
